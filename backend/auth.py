from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import bcrypt
import jwt
import random
import smtplib
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

from models import (
    RegisterInit, VerifyRegister,
    UserLogin, VerifyLogin,
    UserResponse, ChatSave, Set2FARequest,
)
from database import get_db, User, Chat

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

def generate_code() -> str:
    return str(random.randint(100000, 999999))

def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_2fa_enabled": bool(user.is_2fa_enabled),
    }


def _build_email_body(code: str, purpose: str) -> str:
    """Return a Russian-language plain-text email body."""
    separator = "─" * 40
    return (
        f"Привет!\n\n"
        f"Вы запросили код подтверждения для {purpose} в приложении BYTE.\n\n"
        f"{separator}\n"
        f"Ваш одноразовый код подтверждения для BYTE: {code}.\n"
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


def send_smtp_email(to_email: str, code: str) -> None:
    """
    Send a one-time verification code through Mail.ru SMTP.

    Mail.ru requires implicit SSL on port 465 (SMTP_SSL).
    Any SMTP/network failure is logged and the code is duplicated to the
    backend console so the registration flow is not blocked.
    """
    _log_code_to_console(to_email, code)

    if not SMTP_USER or not SMTP_PASS:
        print("[EMAIL] SMTP is not configured — code printed to console only.")
        return

    body = _build_email_body(code, purpose="подтверждения")

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
    """Register/2FA wrapper: log purpose, then send via Mail.ru SMTP."""
    print(f"[EMAIL] Sending verification code for {purpose}")
    send_smtp_email(to_email, code)


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
def register_verify(data: VerifyRegister, db: Session = Depends(get_db)):
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

    token = create_access_token({"sub": db_user.email, "id": db_user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_to_dict(db_user),
    }


# ── Login (with optional 2FA) ─────────────────────────────────────────────────

@router.post("/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    """
    Login endpoint.
    - If 2FA is disabled: returns JWT immediately.
    - If 2FA is enabled: dispatches a code and returns {"status": "requires_verification"}.
    """
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
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

    token = create_access_token({"sub": user.email, "id": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_to_dict(user),
    }


@router.post("/login/verify")
def login_verify(data: VerifyLogin, db: Session = Depends(get_db)):
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

    token = create_access_token({"sub": user.email, "id": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_to_dict(user),
    }


# ── Authenticated endpoints ───────────────────────────────────────────────────

@router.get("/me")
def get_me(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return _user_to_dict(user) | {"created_at": user.created_at}


@router.delete("/delete")
def delete_account(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """
    Permanently delete the authenticated user and all their chats (cascaded).
    """
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    db.delete(user)
    db.commit()
    return {"status": "deleted", "message": "Аккаунт успешно удалён"}


@router.patch("/2fa")
def set_2fa(
    data: Set2FARequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Enable or disable two-factor authentication for the authenticated user."""
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.is_2fa_enabled = data.enabled
    db.commit()
    return {
        "status": "updated",
        "is_2fa_enabled": data.enabled,
        "message": f"Двухфакторная аутентификация {'включена' if data.enabled else 'отключена'}",
    }


@router.post("/chats/save")
def save_chat(
    data: ChatSave,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

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
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

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
