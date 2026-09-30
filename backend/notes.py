"""Student notes with optional GigaChat auto-categorization."""
from __future__ import annotations

import os
import re
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_gigachat import GigaChat
from sqlalchemy.orm import Session

from auth import decode_token, oauth2_scheme
from database import Note, User, get_db
from models import NoteCreate, NoteUpdate

load_dotenv()

router = APIRouter(prefix="/notes", tags=["notes"])

_giga = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    model="GigaChat-2-Pro",
)

_CLASSIFY_PROMPT = """Ты классификатор студенческих заметок.
По тексту заметки верни РОВНО одно слово — категорию на русском языке.
Ориентиры: Физика, Математика, Лабы, Сессия, Разное.
Если тема другая, придумай одно короткое слово (например: Химия, История, Программирование).
Если текста недостаточно, верни Разное.
Без кавычек, пояснений, точек и списков. Только одно слово."""

_WORD = re.compile(r"[A-Za-zА-Яа-яЁё0-9\-]+")


def _current_user(token: str, db: Session) -> User:
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


def _owned_note(db: Session, user: User, note_id: int) -> Note:
    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Заметка не найдена")
    return note


def _one_word(raw: str) -> str:
    match = _WORD.search(raw or "")
    if not match:
        return "Разное"
    word = match.group(0)
    if len(word) > 40:
        return "Разное"
    return word[:1].upper() + word[1:]


def _classify(text: str) -> str:
    source = text.strip()
    if len(source) > 8000:
        source = source[:8000]
    try:
        response = _giga.invoke(
            [
                SystemMessage(content=_CLASSIFY_PROMPT),
                HumanMessage(content=source),
            ]
        )
    except Exception as exc:
        print(f"[NOTES ERROR] GigaChat request failed: {exc}")
        raise HTTPException(status_code=502, detail="Не удалось обратиться к GigaChat") from exc

    content = getattr(response, "content", "") or ""
    print(f"[NOTES] GigaChat category reply: {content[:120]!r}")
    return _one_word(content)


def _resolve_category(ai_classify: bool, category: str | None, title: str, content: str) -> str:
    manual = (category or "").strip()
    if not ai_classify:
        return manual or "Разное"
    source = (content or "").strip() or (title or "").strip()
    if not source:
        return manual or "Разное"
    ai_word = _classify(source)
    parts = [part.strip() for part in manual.split(",") if part.strip()]
    if parts == ["Разное"]:
        parts = []
    if ai_word not in parts:
        parts.append(ai_word)
    return ", ".join(parts) if parts else "Разное"


def _note_to_dict(row: Note) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "title": row.title or "",
        "content": row.content or "",
        "category": row.category or "Разное",
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


@router.get("")
def list_notes(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    rows = (
        db.query(Note)
        .filter(Note.user_id == user.id)
        .order_by(Note.created_at.desc(), Note.id.desc())
        .all()
    )
    return {"items": [_note_to_dict(row) for row in rows]}


@router.post("")
def create_note(
    data: NoteCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    now = datetime.utcnow()
    title = (data.title or "").strip()
    content = data.content or ""
    note = Note(
        user_id=user.id,
        title=title,
        content=content,
        category=_resolve_category(data.ai_classify, data.category, title, content),
        created_at=data.created_at or now,
        updated_at=now,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_to_dict(note)


@router.put("/{note_id}")
def update_note(
    note_id: int,
    data: NoteUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    note = _owned_note(db, user, note_id)
    if data.title is not None:
        note.title = data.title.strip()
    if data.content is not None:
        note.content = data.content
    if data.ai_classify or data.category is not None:
        note.category = _resolve_category(
            data.ai_classify,
            data.category if data.category is not None else note.category,
            note.title or "",
            note.content or "",
        )
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return _note_to_dict(note)


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    note = _owned_note(db, user, note_id)
    db.delete(note)
    db.commit()
    return {"status": "deleted", "id": note_id}
