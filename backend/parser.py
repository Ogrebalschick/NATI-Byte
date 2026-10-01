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
from fastapi import APIRouter, Depends, HTTPException, Query
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_gigachat import GigaChat
from sqlalchemy.orm import Session

from auth import oauth2_scheme, resolve_user
from database import StudentData, User, get_db
from models import CabinetParseRequest

load_dotenv()

router = APIRouter(prefix="/sync", tags=["sync"])

ALLOWED_PAGE_TYPES = {
    "profile",
    "timetable",
    "progress",
    "task",
    "kp_rgz_praktiki",
    "academic_backlog",
    "individual_progress",
    "timetable_consult",
    "timetable_session",
}

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

PROGRESS_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from a PROGRESS / grades page
(успеваемость, контрольные недели, зачётная книжка).

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If there are no subjects, return {"subjects": []}.

Required JSON shape:
{
  "semester": string | null,
  "control_week": string | null,
  "subjects": [
    {
      "name": string,
      "control_type": string | null,
      "grade": string | null,
      "points": number | null,
      "teacher": string | null,
      "attestation": string | null
    }
  ]
}

Rules:
- control_type is экзамен / зачёт / дифференцированный зачёт / курсовая / КП / РГЗ when present.
- grade is the textual mark (отлично, хорошо, зачтено, 5, н/я, ...) when present.
- points is a numeric score when present, otherwise null.
- Never invent grades that are not in the raw text.
- Output encoding: UTF-8 JSON.
"""

TASK_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from a TASKS page
(текущие задания, РГЗ, КП, практики).

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If there are no tasks, return {"tasks": []}.

Required JSON shape:
{
  "tasks": [
    {
      "subject": string,
      "title": string | null,
      "task_type": string | null,
      "deadline": string | null,
      "status": string | null,
      "teacher": string | null,
      "comment": string | null
    }
  ]
}

Rules:
- task_type is РГЗ / КП / практика / домашнее задание / лабораторная when present.
- status is сдано / не сдано / на проверке / просрочено when present.
- Never invent tasks that are not in the raw text.
- Output encoding: UTF-8 JSON.
"""

ACADEMIC_BACKLOG_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from an ACADEMIC BACKLOG page
(академические задолженности, «хвосты»).

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If there are no backlogs, return {"backlogs": []}.

Required JSON shape:
{
  "backlogs": [
    {
      "subject": string,
      "teacher": string | null,
      "control_type": string | null,
      "status": string | null,
      "deadline": string | null,
      "semester": string | null
    }
  ]
}

Rules:
- status is не сдано / к пересдаче / ликвидировано when present.
- Never invent backlogs that are not in the raw text.
- Output encoding: UTF-8 JSON.
"""

INDIVIDUAL_PROGRESS_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from an INDIVIDUAL PROGRESS /
achievements page (индивидуальные достижения студента).

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If there are no achievements, return {"achievements": []}.

Required JSON shape:
{
  "achievements": [
    {
      "title": string,
      "category": string | null,
      "date": string | null,
      "level": string | null,
      "result": string | null,
      "document": string | null
    }
  ]
}

Rules:
- category is олимпиада / конференция / спорт / волонтёрство / публикация when present.
- Never invent achievements that are not in the raw text.
- Output encoding: UTF-8 JSON.
"""

TIMETABLE_SESSION_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from an EXAM SESSION timetable
(расписание экзаменов / сессии).

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If there are no exams, return {"exams": []}.

Required JSON shape:
{
  "exams": [
    {
      "subject": string,
      "date": string | null,
      "time": string | null,
      "room": string | null,
      "teacher": string | null,
      "control_type": string | null
    }
  ]
}

Rules:
- control_type is экзамен / зачёт / консультация when present in this table.
- Never invent exams that are not in the raw text.
- Output encoding: UTF-8 JSON.
"""

TIMETABLE_CONSULT_SYSTEM_PROMPT = """You are a strict data extractor for NSTU student cabinet pages (ciu.nstu.ru).
The user message contains raw visible text copied from a CONSULTATIONS timetable
(расписание консультаций).

Return ONLY valid JSON. No markdown, no comments, no extra keys.
If there are no consultations, return {"consultations": []}.

Required JSON shape:
{
  "consultations": [
    {
      "subject": string,
      "date": string | null,
      "time": string | null,
      "room": string | null,
      "teacher": string | null
    }
  ]
}

Rules:
- Never invent consultations that are not in the raw text.
- Output encoding: UTF-8 JSON.
"""

# page_type -> GigaChat system prompt (profile/timetable keep their original constants)
PAGE_TYPE_PROMPTS: dict[str, str] = {
    "profile": PROFILE_SYSTEM_PROMPT,
    "timetable": TIMETABLE_SYSTEM_PROMPT,
    "progress": PROGRESS_SYSTEM_PROMPT,
    "task": TASK_SYSTEM_PROMPT,
    "kp_rgz_praktiki": TASK_SYSTEM_PROMPT,
    "academic_backlog": ACADEMIC_BACKLOG_SYSTEM_PROMPT,
    "individual_progress": INDIVIDUAL_PROGRESS_SYSTEM_PROMPT,
    "timetable_consult": TIMETABLE_CONSULT_SYSTEM_PROMPT,
    "timetable_session": TIMETABLE_SESSION_SYSTEM_PROMPT,
}


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
            detail="Недопустимый page_type",
        )
    if not data.raw_text or not data.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text не должен быть пустым")

    user = resolve_user(token, db)

    print(f"[SYNC] Parsing {page_type} for user_id={user.id}")

    system_prompt = PAGE_TYPE_PROMPTS.get(page_type)
    if not system_prompt:
        raise HTTPException(status_code=400, detail="Недопустимый page_type")
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


def _iso_dt(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return value.isoformat() + "Z"
    except Exception:
        return str(value)


@router.get("/student-data")
def get_student_data(
    types: str | None = Query(None, description="Comma-separated data_type filters"),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Return stored cabinet JSON snapshots for the current user."""
    user = resolve_user(token, db)

    requested = [t.strip().lower() for t in (types or "").split(",") if t.strip()]
    query = db.query(StudentData).filter(StudentData.user_id == user.id)
    if requested:
        unknown = [t for t in requested if t not in ALLOWED_PAGE_TYPES]
        if unknown:
            raise HTTPException(status_code=400, detail="Недопустимый data_type")
        query = query.filter(StudentData.data_type.in_(requested))

    items = {}
    for row in query.all():
        items[row.data_type] = {
            "payload": row.payload or {},
            "updated_at": _iso_dt(row.updated_at),
        }
    return {"items": items}
