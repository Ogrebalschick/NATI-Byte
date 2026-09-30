"""AI memory about a student. The owner can inspect and delete every fact."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth import decode_token, oauth2_scheme
from database import User, UserFact, get_db
from models import UserFactUpdate, UserFactsCreate, UserFactsGroupedResponse

router = APIRouter(prefix="/profile", tags=["profile"])

# Stable order for the sources the app writes. Unknown sources are still returned.
FACT_SOURCES = ("cabinet", "chat", "notes", "grades")
MAX_FACT_LENGTH = 400
MAX_FACTS_PER_REQUEST = 12

_WORD = re.compile(r"[a-zа-я0-9]+(?:-[a-zа-я0-9]+)*", re.IGNORECASE)
# Words that don't distinguish one memory from another.
_STOP = frozenset({
    "я", "мы", "ты", "он", "она", "они", "мне", "меня", "мой", "моя", "мои", "мое",
    "это", "этот", "эта", "эти", "есть", "быть", "является", "являюсь",
    "и", "а", "но", "или", "что", "как", "не", "да", "уже", "еще", "тоже", "также",
    "в", "на", "по", "с", "со", "к", "ко", "из", "от", "для", "о", "об", "у", "за",
    "очень", "просто", "вообще", "тоже",
    "люблю", "любит", "любишь", "любят", "нравится", "нравятся", "обожаю", "обожает",
    "увлекаюсь", "увлекается", "занимаюсь", "занимается", "предпочитаю", "предпочитает",
    "студент", "студентка", "пользователь",
})
_ENDINGS = (
    "ироваться", "ирование", "ировать", "ование", "овать", "евать", "ивать",
    "ениями", "остями", "ами", "ями", "ого", "ему", "ыми", "ими",
    "ение", "ание", "ость", "ах", "ях", "ов", "ев", "ей",
    "ий", "ый", "ой", "ая", "яя", "ое", "ее", "ые", "ие",
    "ать", "ять", "ить", "еть", "ться", "ть", "ся",
)


def _normalize(text: str) -> str:
    cleaned = (text or "").lower().replace("ё", "е")
    cleaned = re.sub(r"[^a-zа-я0-9\s-]", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _stem(word: str) -> str:
    for ending in _ENDINGS:
        if word.endswith(ending) and len(word) - len(ending) >= 4:
            return word[: -len(ending)]
    if len(word) > 4 and word[-1] in "аеиоуыэюяьй":
        return word[:-1]
    return word


def _tokens(text: str) -> frozenset[str]:
    found: list[str] = []
    for word in _WORD.findall(_normalize(text)):
        if word in _STOP:
            continue
        if len(word) < 3 and not any(char.isdigit() for char in word):
            continue
        if any(char.isdigit() for char in word):
            found.append(word)
        else:
            found.append(_stem(word))
    return frozenset(found)


def _same_fact(candidate: str, stored: str) -> bool:
    """True when the candidate adds nothing beyond a fact already stored."""
    left = _normalize(candidate)
    right = _normalize(stored)
    if not left or not right:
        return False
    if left == right:
        return True
    candidate_tokens = _tokens(candidate)
    stored_tokens = _tokens(stored)
    if not candidate_tokens or not stored_tokens:
        return False
    return candidate_tokens <= stored_tokens


def _current_user(token: str, db: Session) -> User:
    payload = decode_token(token)
    user_id = payload.get("id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


def _owned_fact(db: Session, user: User, fact_id: int) -> UserFact:
    fact = (
        db.query(UserFact)
        .filter(UserFact.id == fact_id, UserFact.user_id == user.id)
        .first()
    )
    if not fact:
        raise HTTPException(status_code=404, detail="Факт не найден")
    return fact


def _fact_to_dict(row: UserFact) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "fact_text": row.fact_text or "",
        "source": row.source or "",
        "created_at": row.created_at,
    }


def _group_facts(rows: list[UserFact]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {source: [] for source in FACT_SOURCES}
    for row in rows:
        source = row.source if row.source in groups else (row.source or "unknown")
        groups.setdefault(source, []).append(_fact_to_dict(row))
    return groups


@router.get("/facts", response_model=UserFactsGroupedResponse)
def list_facts(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Return every stored fact for the current user, grouped by source."""
    user = _current_user(token, db)
    try:
        rows = (
            db.query(UserFact)
            .filter(UserFact.user_id == user.id)
            .order_by(UserFact.created_at.desc(), UserFact.id.desc())
            .all()
        )
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Не удалось загрузить память ИИ") from exc
    return {"groups": _group_facts(rows)}


@router.post("/facts")
def create_facts(
    data: UserFactsCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Store new facts. Exact copies and paraphrases of stored facts are skipped."""
    user = _current_user(token, db)
    source = data.source if data.source in FACT_SOURCES else "chat"
    cleaned: list[str] = []
    for raw in data.facts[:MAX_FACTS_PER_REQUEST]:
        text = (raw or "").strip()
        if not text:
            continue
        if len(text) > MAX_FACT_LENGTH:
            text = text[:MAX_FACT_LENGTH].rstrip()
        if any(_same_fact(text, kept) for kept in cleaned):
            continue
        cleaned.append(text)
    if not cleaned:
        return {"created": []}
    try:
        existing = [
            (row.fact_text or "").strip()
            for row in db.query(UserFact).filter(UserFact.user_id == user.id).all()
            if (row.fact_text or "").strip()
        ]
        created: list[UserFact] = []
        for text in cleaned:
            if any(_same_fact(text, stored) for stored in existing):
                continue
            row = UserFact(user_id=user.id, fact_text=text, source=source)
            db.add(row)
            created.append(row)
            existing.append(text)
        db.commit()
        for row in created:
            db.refresh(row)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Не удалось сохранить факты") from exc
    return {"created": [_fact_to_dict(row) for row in created]}


@router.put("/facts/{fact_id}")
def update_fact(
    fact_id: int,
    data: UserFactUpdate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Replace the text of one fact owned by the current user."""
    user = _current_user(token, db)
    fact = _owned_fact(db, user, fact_id)
    text = (data.fact_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст факта не должен быть пустым")
    if len(text) > MAX_FACT_LENGTH:
        text = text[:MAX_FACT_LENGTH].rstrip()
    try:
        fact.fact_text = text
        db.commit()
        db.refresh(fact)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Не удалось обновить факт") from exc
    return _fact_to_dict(fact)


@router.delete("/facts/all")
def delete_all_facts(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Erase the entire AI memory of the current user."""
    user = _current_user(token, db)
    try:
        deleted = (
            db.query(UserFact)
            .filter(UserFact.user_id == user.id)
            .delete(synchronize_session=False)
        )
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Не удалось очистить память ИИ") from exc
    return {"status": "deleted", "deleted": deleted}


@router.delete("/facts/{fact_id}")
def delete_fact(
    fact_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Delete one fact. Facts of other users are reported as missing."""
    user = _current_user(token, db)
    fact = _owned_fact(db, user, fact_id)
    try:
        db.delete(fact)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Не удалось удалить факт") from exc
    return {"status": "deleted", "id": fact_id}
