"""AI memory about a student. The owner can inspect and delete every fact."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth import decode_token, oauth2_scheme
from database import User, UserFact, get_db
from models import UserFactsGroupedResponse

router = APIRouter(prefix="/profile", tags=["profile"])

# Stable order for the sources the app writes. Unknown sources are still returned.
FACT_SOURCES = ("cabinet", "chat", "notes", "grades")


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
