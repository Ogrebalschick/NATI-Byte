"""AI parser for NSTU student cabinet pages (ciu.nstu.ru).

The frontend collects page text and posts it here. GigaChat extracts a
strict JSON payload which is stored in student_data and, for profile pages,
mirrored onto the User row.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_gigachat import GigaChat
from sqlalchemy.orm import Session

from auth import decode_token, oauth2_scheme
from database import StudentData, User, get_db
from models import CabinetParseRequest

load_dotenv()

router = APIRouter(prefix="/sync", tags=["sync"])

ALLOWED_PAGE_TYPES = {"profile", "timetable"}

_giga = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    model="GigaChat-2-Pro",
)

PROFILE_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from a PROFILE page.

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If a field is missing in the source text, use null.

Required JSON shape:
{
  "full_name": string | null,
  "student_group": string | null,
  "faculty": string | null,
  "course": string | null,
  "record_book": string | null,
  "specialty": string | null
}

Rules:
- full_name is the student's ФИО (last name, first name, patronymic).
- student_group is the academic group code (e.g. "ПМ-21", "АВТ-31").
- Never invent data that is not present in the raw text.
- Output encoding: UTF-8 JSON.
"""

TIMETABLE_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from a TIMETABLE / schedule page.

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If the page has no lessons, return {"days": []}.

Required JSON shape:
{
  "days": [
    {
      "day": string,
      "date": string | null,
      "lessons": [
        {
          "time": string,
          "subject": string,
          "type": string | null,
          "room": string | null,
          "teacher": string | null,
          "week": string | null
        }
      ]
    }
  ]
}

Rules:
- day is a weekday name (Понедельник, Вторник, ...).
- time is a start-end interval like "08:30-10:00".
- type is лекция / практика / лабораторная when present.
- week is числитель / знаменатель / обе when present.
- Never invent lessons that are not in the raw text.
- Output encoding: UTF-8 JSON.
"""


def _extract_json(text: str) -> dict:
    """Parse JSON from a model reply, stripping optional markdown fences."""
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1).strip()
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


def _ask_gigachat(system_prompt: str, raw_text: str) -> dict:
    """Call GigaChat and return parsed JSON. Raises HTTPException on failure."""
    truncated = raw_text.strip()
    if len(truncated) > 20000:
        truncated = truncated[:20000]
        print("[SYNC] Raw text truncated to 20000 characters")

    try:
        response = _giga.invoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=truncated),
            ]
        )
    except Exception as exc:
        print(f"[SYNC ERROR] GigaChat request failed: {exc}")
        raise HTTPException(status_code=502, detail="Не удалось обратиться к GigaChat") from exc

    content = getattr(response, "content", "") or ""
    print(f"[SYNC] GigaChat reply length: {len(content)}")

    try:
        payload = _extract_json(content)
    except (json.JSONDecodeError, ValueError) as exc:
        print(f"[SYNC ERROR] Failed to parse GigaChat JSON: {exc}")
        print(f"[SYNC ERROR] Raw reply: {content[:500]}")
        raise HTTPException(
            status_code=502,
            detail="GigaChat вернул ответ, который нельзя разобрать как JSON",
        ) from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="GigaChat вернул не объект JSON")
    return payload


def _upsert_student_data(db: Session, user_id: int, data_type: str, payload: dict) -> StudentData:
    row = (
        db.query(StudentData)
        .filter(StudentData.user_id == user_id, StudentData.data_type == data_type)
        .first()
    )
    now = datetime.utcnow()
    if row:
        row.payload = payload
        row.updated_at = now
    else:
        row = StudentData(
            user_id=user_id,
            data_type=data_type,
            payload=payload,
            updated_at=now,
        )
        db.add(row)
    return row


@router.post("/parse-cabinet")
def parse_cabinet(
    data: CabinetParseRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Parse NSTU cabinet page text with GigaChat and persist the JSON snapshot."""
    page_type = (data.page_type or "").strip().lower()
    if page_type not in ALLOWED_PAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="page_type должен быть 'profile' или 'timetable'",
        )
    if not data.raw_text or not data.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text не должен быть пустым")

    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    print(f"[SYNC] Parsing {page_type} for user_id={user.id}")

    system_prompt = PROFILE_SYSTEM_PROMPT if page_type == "profile" else TIMETABLE_SYSTEM_PROMPT
    parsed = _ask_gigachat(system_prompt, data.raw_text)

    try:
        _upsert_student_data(db, user.id, page_type, parsed)

        if page_type == "profile":
            full_name = parsed.get("full_name")
            student_group = parsed.get("student_group")
            if isinstance(full_name, str) and full_name.strip():
                user.full_name = full_name.strip()
            if isinstance(student_group, str) and student_group.strip():
                user.student_group = student_group.strip()

        user.is_synced_with_nstu = True
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        print(f"[SYNC ERROR] Failed to persist parsed data: {exc}")
        raise HTTPException(status_code=500, detail="Не удалось сохранить данные студента") from exc

    print(f"[SYNC] Saved {page_type} snapshot for user_id={user.id}")
    return {
        "status": "ok",
        "page_type": page_type,
        "payload": parsed,
        "is_synced_with_nstu": True,
        "full_name": user.full_name,
        "student_group": user.student_group,
    }
