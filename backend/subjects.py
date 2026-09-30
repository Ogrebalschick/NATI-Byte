"""Manual subject score tracking for BYTE students."""
from __future__ import annotations

import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from auth import decode_token, oauth2_scheme
from database import CustomSubject, ScoreLog, User, get_db
from models import CustomSubjectCreate, ScoreLogCreate

router = APIRouter(prefix="/subjects", tags=["subjects"])


def _current_user(token: str, db: Session) -> User:
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


def _owned_subject(db: Session, user: User, subject_id: int) -> CustomSubject:
    subject = (
        db.query(CustomSubject)
        .filter(CustomSubject.id == subject_id, CustomSubject.user_id == user.id)
        .first()
    )
    if not subject:
        raise HTTPException(status_code=404, detail="Предмет не найден")
    return subject


def _score_to_dict(row: ScoreLog) -> dict:
    return {
        "id": row.id,
        "subject_id": row.subject_id,
        "score": row.score,
        "description": row.description,
        "created_at": row.created_at,
    }


def _subject_to_dict(row: CustomSubject) -> dict:
    logs = sorted(row.scores or [], key=lambda item: item.created_at or item.id, reverse=True)
    total = sum(item.score or 0 for item in logs)
    return {
        "id": row.id,
        "user_id": row.user_id,
        "name": row.name,
        "max_score": row.max_score,
        "target_score": row.target_score,
        "is_custom": bool(row.is_custom),
        "current_score": total,
        "scores": [_score_to_dict(item) for item in logs],
    }


@router.post("")
def create_subject(
    data: CustomSubjectCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название предмета не должно быть пустым")
    if not math.isfinite(data.max_score) or data.max_score <= 0:
        raise HTTPException(status_code=400, detail="Максимум баллов должен быть больше 0")
    if not math.isfinite(data.target_score) or data.target_score < 0:
        raise HTTPException(status_code=400, detail="Желаемый балл не может быть отрицательным")

    subject = CustomSubject(
        user_id=user.id,
        name=name,
        max_score=float(data.max_score),
        target_score=float(data.target_score),
        is_custom=True if data.is_custom is None else bool(data.is_custom),
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    subject.scores = []
    return _subject_to_dict(subject)


@router.get("")
def list_subjects(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    rows = (
        db.query(CustomSubject)
        .options(joinedload(CustomSubject.scores))
        .filter(CustomSubject.user_id == user.id)
        .order_by(CustomSubject.id.asc())
        .all()
    )
    return {"items": [_subject_to_dict(row) for row in rows]}


@router.post("/{subject_id}/scores")
def add_score(
    subject_id: int,
    data: ScoreLogCreate,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    subject = _owned_subject(db, user, subject_id)
    if not math.isfinite(data.score) or data.score == 0:
        raise HTTPException(status_code=400, detail="Количество баллов не должно быть нулевым")

    description = (data.description or "").strip() or None
    log = ScoreLog(
        subject_id=subject.id,
        score=float(data.score),
        description=description,
        created_at=data.created_at or datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return _score_to_dict(log)


@router.delete("/{subject_id}/scores/{score_id}")
def delete_score(
    subject_id: int,
    score_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    user = _current_user(token, db)
    subject = _owned_subject(db, user, subject_id)
    log = (
        db.query(ScoreLog)
        .filter(ScoreLog.id == score_id, ScoreLog.subject_id == subject.id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Запись баллов не найдена")
    db.delete(log)
    db.commit()
    return {"status": "deleted", "id": score_id}
