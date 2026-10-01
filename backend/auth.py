from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import bcrypt
import jwt
import random
import re
import smtplib
import threading
import uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

from models import (
    RegisterInit, VerifyRegister,
    UserLogin, VerifyLogin,
    UserResponse, UserUpdate, ChatSave, Set2FARequest,
    PasswordResetConfirm,
    NstuLoginRequest,
    SetPasswordRequest,
    UserSessionResponse,
)

from database import get_db, User, Chat, UserSession

load_dotenv()

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Security config ────────────────────────────────────────────────────────────

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set in .env. Server cannot start without it.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# ── SMTP config (Mail.ru: SSL on port 465) ────────────────────────────────────
# Supports both SMTP_PASSWORD (new) and SMTP_PASS (legacy) env var names.

def _env_flag(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes")

SMTP_HOST    = os.getenv("SMTP_HOST", "smtp.mail.ru")
SMTP_PORT    = int(os.getenv("SMTP_PORT", "465"))
SMTP_USE_SSL = _env_flag("SMTP_USE_SSL", "True")
SMTP_USE_TLS = _env_flag("SMTP_USE_TLS", "False")
SMTP_USER    = os.getenv("SMTP_USER", "")
SMTP_PASS    = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS", "")
SMTP_FROM    = os.getenv("SMTP_FROM", "") or SMTP_USER

# ── In-memory pending verification stores ─────────────────────────────────────
# email → {"code": str, "expires_at": datetime, "name": str, "password_hash": str}
_pending_reg: dict = {}
# email → {"code": str, "expires_at": datetime, "user_id": int}
_pending_login: dict = {}
# user_id → {"code": str, "expires_at": datetime, "email": str}
_pending_password: dict = {}
_store_lock = threading.Lock()

CODE_TTL_MINUTES = 10


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Срок действия токена истёк")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Недействительный токен")

_ANDROID_MODEL = re.compile(r";\s*([^;)]+?)\s+Build/", re.IGNORECASE)
_LAST_ACTIVE_TOUCH = timedelta(seconds=60)


def _clean_label(value: str, limit: int = 120) -> str:
    cleaned = "".join(ch for ch in value if ch.isprintable()).strip()
    return cleaned[:limit]


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for", "")
    candidate = forwarded.split(",")[0].strip() if forwarded else ""
    if not candidate and request.client is not None:
        candidate = (request.client.host or "").strip()
    candidate = _clean_label(candidate, 64)
    return candidate or None


def _resolve_device_name(request: Request, explicit: str | None) -> str:
    """Prefer the name sent by the app. Otherwise read a short label from User-Agent."""
    if explicit:
        named = _clean_label(explicit)
        if named:
            return named

    ua = request.headers.get("user-agent", "") or ""
    model = _ANDROID_MODEL.search(ua)
    if model:
        label = _clean_label(model.group(1))
        if label and label.lower() not in {"u", "wv", "mobile"}:
            return label
    if "iPad" in ua:
        return "iPad"
    if "iPhone" in ua:
        return "iPhone"
    if "Android" in ua:
        return "Android"
    if "Windows" in ua:
        return "Windows"
    if "Macintosh" in ua or "Mac OS" in ua:
        return "Mac"
    if "Linux" in ua:
        return "Linux"
    return "Неизвестное устройство"


def _issue_token(db: Session, user: User, request: Request, device_name: str | None) -> str:
    """Persist a device session and return a JWT that carries its id."""
    session_id = str(uuid.uuid4())
    db.add(UserSession(
        id=session_id,
        user_id=user.id,
        device_name=_resolve_device_name(request, device_name),
        ip_address=_client_ip(request),
        last_active=datetime.utcnow(),
    ))
    db.commit()
    print(f"[AUTH] Session opened user_id={user.id}")
    return create_access_token({
        "sub": user.email,
        "id": user.id,
        "session_id": session_id,
    })


def resolve_user(token: str, db: Session, request: Request | None = None) -> User:
    """Decode the JWT and reject it when its session row is gone."""
    payload = decode_token(token)
    session_id = payload.get("session_id")
    user_id = payload.get("id")
    if not session_id or user_id is None:
        raise HTTPException(status_code=401, detail="Сессия недействительна. Войдите снова.")

    session = (
        db.query(UserSession)
        .filter(UserSession.id == session_id, UserSession.user_id == user_id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=401, detail="Сессия завершена. Войдите снова.")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Сессия недействительна. Войдите снова.")

    now = datetime.utcnow()
    if session.last_active is None or now - session.last_active >= _LAST_ACTIVE_TOUCH:
        session.last_active = now
        db.commit()

    if request is not None:
        request.state.session_id = session.id
    return user


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    return resolve_user(token, db, request)


def _current_session_id(request: Request) -> str:
    session_id = getattr(request.state, "session_id", None)
    if not session_id:
        raise HTTPException(status_code=401, detail="Сессия недействительна. Войдите снова.")
    return session_id

def generate_code() -> str:
    return str(random.randint(100000, 999999))

def _has_password(user: User) -> bool:
    return bool(user.password_hash and str(user.password_hash).strip())

def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_2fa_enabled": bool(user.is_2fa_enabled),
        "full_name": user.full_name,
        "student_group": user.student_group,
        "is_synced_with_nstu": bool(user.is_synced_with_nstu),
        "has_password": _has_password(user),
        "wake_time": user.wake_time or "08:00",
        "sleep_time": user.sleep_time or "22:30",
    }


def _build_email_body(code: str, purpose: str) -> str:
    """Return a Russian-language plain-text email body."""
    separator = "─" * 40
    if purpose == "смены пароля":
        headline = f"Ваш код для смены пароля в BYTE: {code}."
    else:
        headline = f"Ваш одноразовый код подтверждения для BYTE: {code}."
    return (
        f"Привет!\n\n"
        f"Вы запросили код подтверждения для {purpose} в приложении BYTE.\n\n"
        f"{separator}\n"
        f"{headline}\n"
        f"Никому не сообщайте этот код.\n"
        f"{separator}\n\n"
        f"Код действителен {CODE_TTL_MINUTES} минут.\n"
        f"Если вы не запрашивали этот код — просто проигнорируйте письмо.\n\n"
        f"С уважением,\nКоманда BYTE"
    )


def _log_code_to_console(to_email: str, code: str, purpose: str = "") -> None:
    """Always print the OTP so registration/login never depend on SMTP alone."""
    print(f"\n{'=' * 52}")
    print(f"[EMAIL] One-time code for {to_email}: {code}")
    if purpose:
        print(f"[EMAIL] Purpose: {purpose}")
    print(f"{'=' * 52}\n")


def send_smtp_email(to_email: str, code: str, purpose: str = "подтверждения") -> None:
    """
    Send a one-time verification code through Mail.ru SMTP.

    Mail.ru requires implicit SSL on port 465 (SMTP_SSL).
    Any SMTP/network failure is logged and the code is duplicated to the
    backend console so the registration flow is not blocked.
    """
    _log_code_to_console(to_email, code, purpose)

    if not SMTP_USER or not SMTP_PASS:
        print("[EMAIL] SMTP is not configured — code printed to console only.")
        return

    body = _build_email_body(code, purpose)

    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg["Subject"] = "Ваш код подтверждения BYTE"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        if SMTP_USE_SSL:
            # Implicit SSL — Mail.ru / Yandex on port 465
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_FROM, to_email, msg.as_string())
        else:
            # Optional STARTTLS — Gmail-style port 587
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.ehlo()
                if SMTP_USE_TLS:
                    server.starttls()
                    server.ehlo()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_FROM, to_email, msg.as_string())

        print(f"[EMAIL] Message sent successfully to {to_email}")

    except smtplib.SMTPAuthenticationError as exc:
        print(f"[EMAIL ERROR] SMTP authentication failed for {SMTP_USER}: {exc}")
        print(f"[EMAIL FALLBACK] Code for {to_email}: {code}")
    except smtplib.SMTPException as exc:
        print(f"[EMAIL ERROR] SMTP error while sending to {to_email}: {exc}")
        print(f"[EMAIL FALLBACK] Code for {to_email}: {code}")
    except OSError as exc:
        print(f"[EMAIL ERROR] Network error connecting to {SMTP_HOST}:{SMTP_PORT}: {exc}")
        print(f"[EMAIL FALLBACK] Code for {to_email}: {code}")
    except Exception as exc:
        print(f"[EMAIL ERROR] Unexpected error: {exc}")
        print(f"[EMAIL FALLBACK] Code for {to_email}: {code}")


def send_verification_email(to_email: str, code: str, purpose: str = "регистрации") -> None:
    """Register/2FA/password-reset wrapper: log purpose, then send via Mail.ru SMTP."""
    print(f"[EMAIL] Sending verification code for {purpose}")
    send_smtp_email(to_email, code, purpose=purpose)


# ── Registration (two-step: init → verify) ────────────────────────────────────

@router.post("/register/init")
def register_init(data: RegisterInit, db: Session = Depends(get_db)):
    """
    Step 1: validate email domain, check uniqueness, hash password,
    store pending record, and dispatch a 6-digit code to the student's inbox.
    """
    if not data.email.endswith("@stud.nstu.ru"):
        raise HTTPException(
            status_code=400,
            detail="Регистрация доступна только для почты @stud.nstu.ru",
        )

    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Пользователь с такой почтой уже зарегистрирован",
        )

    code = generate_code()
    password_hash = get_password_hash(data.password)
    expires = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)

    with _store_lock:
        _pending_reg[data.email] = {
            "code": code,
            "expires_at": expires,
            "name": data.name,
            "password_hash": password_hash,
        }

    send_verification_email(data.email, code, purpose="регистрации")
    return {"status": "code_sent", "message": "Код подтверждения отправлен на вашу почту"}


@router.post("/register/verify")
def register_verify(data: VerifyRegister, request: Request, db: Session = Depends(get_db)):
    """
    Step 2: verify the 6-digit code, create the user, and return a JWT (auto-login).
    """
    with _store_lock:
        pending = _pending_reg.get(data.email)

    if not pending:
        raise HTTPException(
            status_code=400,
            detail="Сначала запросите код подтверждения",
        )
    if datetime.utcnow() > pending["expires_at"]:
        with _store_lock:
            _pending_reg.pop(data.email, None)
        raise HTTPException(status_code=400, detail="Код истёк. Запросите новый.")
    if pending["code"] != data.code.strip():
        raise HTTPException(status_code=400, detail="Неверный код подтверждения")

    # Create user in DB
    db_user = User(
        email=data.email,
        password_hash=pending["password_hash"],
        name=pending["name"],
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    with _store_lock:
        _pending_reg.pop(data.email, None)

    token = _issue_token(db, db_user, request, data.device_name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_to_dict(db_user),
    }


# ── Login (with optional 2FA) ─────────────────────────────────────────────────

@router.post("/login")
def login(data: UserLogin, request: Request, db: Session = Depends(get_db)):
    """
    Login endpoint.
    - If 2FA is disabled: returns JWT immediately.
    - If 2FA is enabled: dispatches a code and returns {"status": "requires_verification"}.
    """
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not _has_password(user) or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if user.is_2fa_enabled:
        code = generate_code()
        expires = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
        with _store_lock:
            _pending_login[data.email] = {
                "code": code,
                "expires_at": expires,
                "user_id": user.id,
            }
        send_verification_email(data.email, code, purpose="входа в аккаунт")
        return {"status": "requires_verification"}

    token = _issue_token(db, user, request, data.device_name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "has_password": _has_password(user),
        "user": _user_to_dict(user),
    }


@router.post("/nstu-login")
def nstu_login(data: NstuLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    One-click login / register using an email scraped from the NSTU cabinet.
    New accounts are created without a BYTE password (has_password=False).
    """
    email = str(data.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()
    created = False

    if not user:
        local_part = email.split("@")[0]
        user = User(
            email=email,
            password_hash="",
            name=local_part or "Студент НГТУ",
            is_synced_with_nstu=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created = True
        print(f"[AUTH] NSTU ID registered user_id={user.id} email={email}")
    else:
        user.is_synced_with_nstu = True
        db.commit()
        print(f"[AUTH] NSTU ID login user_id={user.id} email={email}")

    token = _issue_token(db, user, request, data.device_name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "has_password": _has_password(user),
        "created": created,
        "user": _user_to_dict(user),
    }


@router.post("/login/verify")
def login_verify(data: VerifyLogin, request: Request, db: Session = Depends(get_db)):
    """2FA step: verify code and return JWT."""
    with _store_lock:
        pending = _pending_login.get(data.email)

    if not pending:
        raise HTTPException(
            status_code=400,
            detail="Сначала выполните вход с вашим паролем",
        )
    if datetime.utcnow() > pending["expires_at"]:
        with _store_lock:
            _pending_login.pop(data.email, None)
        raise HTTPException(status_code=400, detail="Код истёк. Попробуйте войти снова.")
    if pending["code"] != data.code.strip():
        raise HTTPException(status_code=400, detail="Неверный код подтверждения")

    user = db.query(User).filter(User.id == pending["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    with _store_lock:
        _pending_login.pop(data.email, None)

    token = _issue_token(db, user, request, data.device_name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_to_dict(user),
    }


# ── Authenticated endpoints ───────────────────────────────────────────────────

def _session_payload(row: UserSession, current_id: str) -> UserSessionResponse:
    return UserSessionResponse(
        id=row.id,
        device_name=row.device_name,
        ip_address=row.ip_address,
        last_active=row.last_active,
        is_current=row.id == current_id,
    )


@router.get("/sessions", response_model=list[UserSessionResponse])
def list_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Devices where this account is signed in. The caller is marked is_current."""
    current_id = _current_session_id(request)
    rows = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id)
        .order_by(UserSession.last_active.desc())
        .all()
    )
    return [_session_payload(row, current_id) for row in rows]


@router.delete("/sessions/other")
def revoke_other_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sign out every device except the one making this request."""
    current_id = _current_session_id(request)
    revoked = (
        db.query(UserSession)
        .filter(UserSession.user_id == user.id, UserSession.id != current_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"status": "deleted", "revoked": revoked}


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sign out one device. A missing or foreign session looks the same."""
    row = (
        db.query(UserSession)
        .filter(UserSession.id == session_id, UserSession.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return _user_to_dict(user) | {"created_at": user.created_at}


@router.patch("/profile/schedule")
def update_profile_schedule(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save the student's biorhythm clock.

    `wake_time` fires the morning wish, `sleep_time` the evening one.
    Both are "HH:MM" in Novosibirsk time. Only fields present in the body change.
    """
    provided = data.model_fields_set
    if "wake_time" in provided:
        user.wake_time = data.wake_time or "08:00"
    if "sleep_time" in provided:
        user.sleep_time = data.sleep_time or "22:30"
    db.commit()
    db.refresh(user)
    return {
        "status": "updated",
        "wake_time": user.wake_time or "08:00",
        "sleep_time": user.sleep_time or "22:30",
    }


@router.delete("/delete")
def delete_account(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently delete the authenticated user and all their chats (cascaded).
    """
    db.delete(user)
    db.commit()
    return {"status": "deleted", "message": "Аккаунт успешно удалён"}


@router.patch("/2fa")
def set_2fa(
    data: Set2FARequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enable or disable two-factor authentication for the authenticated user."""
    user.is_2fa_enabled = data.enabled
    db.commit()
    return {
        "status": "updated",
        "is_2fa_enabled": data.enabled,
        "message": f"Двухфакторная аутентификация {'включена' if data.enabled else 'отключена'}",
    }


@router.post("/password-reset/request")
def password_reset_request(
    user: User = Depends(get_current_user),
):
    """Send a 6-digit code to the authenticated user's email for a password change."""
    code = generate_code()
    expires = datetime.utcnow() + timedelta(minutes=CODE_TTL_MINUTES)
    with _store_lock:
        _pending_password[user.id] = {
            "code": code,
            "expires_at": expires,
            "email": user.email,
        }

    send_verification_email(user.email, code, purpose="смены пароля")
    return {"status": "code_sent", "message": "Код для смены пароля отправлен на вашу почту"}


@router.post("/password-reset/confirm")
def password_reset_confirm(
    data: PasswordResetConfirm,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify the email code and persist the new bcrypt-hashed password."""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен содержать минимум 6 символов")

    with _store_lock:
        pending = _pending_password.get(user.id)

    if not pending:
        raise HTTPException(status_code=400, detail="Сначала запросите код для смены пароля")
    if datetime.utcnow() > pending["expires_at"]:
        with _store_lock:
            _pending_password.pop(user.id, None)
        raise HTTPException(status_code=400, detail="Код истёк. Запросите новый.")
    if pending["code"] != data.code.strip():
        raise HTTPException(status_code=400, detail="Неверный код подтверждения")

    user.password_hash = get_password_hash(data.new_password)
    db.commit()

    with _store_lock:
        _pending_password.pop(user.id, None)

    return {"status": "updated", "has_password": True, "message": "Пароль успешно изменён"}


@router.post("/set-password")
def set_password(
    data: SetPasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set a BYTE password for NSTU-ID accounts that currently have an empty hash."""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен содержать минимум 6 символов")

    user.password_hash = get_password_hash(data.new_password)
    db.commit()
    print(f"[AUTH] Password set for user_id={user.id}")
    return {"status": "updated", "has_password": True, "message": "Пароль успешно установлен"}


@router.post("/chats/save")
def save_chat(
    data: ChatSave,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = db.query(Chat).filter(Chat.id == data.id, Chat.user_id == user.id).first()
    if chat:
        chat.title = data.title
        chat.messages = data.messages
        chat.updated_at = datetime.utcnow()
    else:
        chat = Chat(id=data.id, user_id=user.id, title=data.title, messages=data.messages)
        db.add(chat)

    db.commit()
    return {"success": True}


@router.get("/chats")
def get_chats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [
        {
            "id": c.id,
            "title": c.title,
            "messages": c.messages,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        }
        for c in db.query(Chat).filter(Chat.user_id == user.id).all()
    ]
