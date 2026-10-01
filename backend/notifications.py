"""
Notification router — in-app notification feed for BYTE.

All endpoints require a valid JWT (via get_current_user).

Routes:
    GET    /notifications                   — list all notifications (newest first)
    GET    /notifications/unread-count      — badge count: number of unread notifications
    PATCH  /notifications/{id}/read         — mark one notification as read
    POST   /notifications/read-all          — mark every notification as read in bulk
    POST   /notifications                   — create a notification (backend / scheduler use)

Lifecycle:
    Notifications are pushed by backend services (deadline scanners, daily-wish jobs, etc.)
    and consumed by the mobile client, which renders the bell-badge and a notification list.
    is_read transitions are one-way (True only — no un-read support).

Categories: "tasks" | "reminders" | "wishes"
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db, User, Notification
from models import (
    NotificationCreate,
    NotificationResponse,
    NotificationUpdate,
    UnreadCountResponse,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_notification_or_404(notification_id: int, user_id: int, db: Session) -> Notification:
    """Return notification owned by *user_id*, or raise 404."""
    notif = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .first()
    )
    if notif is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено",
        )
    return notif


# ── GET /notifications ────────────────────────────────────────────────────────

@router.get("", response_model=List[NotificationResponse])
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Notification]:
    """
    Return all notifications for the current user, sorted by *created_at* descending
    (most recent first).  Both read and unread notifications are included.
    """
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )


# ── GET /notifications/unread-count ──────────────────────────────────────────

@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UnreadCountResponse:
    """
    Return the number of unread notifications.
    Intended for the notification-bell badge on the client.
    """
    count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .count()
    )
    return UnreadCountResponse(count=count)


# ── PATCH /notifications/{notification_id}/read ───────────────────────────────

@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    payload: NotificationUpdate = NotificationUpdate(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Notification:
    """
    Mark a single notification as read (or unread if *is_read=False* is passed).

    Raises 404 if the notification does not exist or does not belong to the caller.
    """
    notif = _get_notification_or_404(notification_id, current_user.id, db)
    notif.is_read = payload.is_read
    db.commit()
    db.refresh(notif)
    return notif


# ── POST /notifications/read-all ─────────────────────────────────────────────

@router.post("/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Mark **all** unread notifications of the current user as read in a single
    bulk UPDATE statement.  Returns the number of rows affected.
    """
    marked = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .update({"is_read": True}, synchronize_session=False)
    )
    db.commit()
    return {"status": "ok", "marked": marked}


# ── POST /notifications ───────────────────────────────────────────────────────

@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
def create_notification(
    payload: NotificationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Notification:
    """
    Push a new notification into the current user's feed.

    **Intended callers:** backend scheduled jobs (daily wishes, deadline scanners,
    study reminders).  In production, this endpoint can be restricted to a service
    account or internal network; for now it accepts any authenticated user so that
    development tooling and the future scheduler can call it without extra auth.

    `category` must be one of: ``"tasks"`` | ``"reminders"`` | ``"wishes"``.
    """
    notif = Notification(
        user_id=current_user.id,
        title=payload.title.strip(),
        body=payload.body.strip(),
        category=payload.category,
        is_read=False,
        created_at=datetime.utcnow(),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif
