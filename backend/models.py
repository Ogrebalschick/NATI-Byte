from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime


# ── Registration ──────────────────────────────────────────────────────────────

class RegisterInit(BaseModel):
    """Step 1 of registration: send email + password + name to trigger code dispatch."""
    email: EmailStr
    password: str
    name: str

class VerifyRegister(BaseModel):
    """Step 2 of registration: confirm the 6-digit code received by email."""
    email: EmailStr
    code: str


# ── Login / 2FA ───────────────────────────────────────────────────────────────

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class VerifyLogin(BaseModel):
    """2FA step: confirm the 6-digit code sent after a successful credential check."""
    email: EmailStr
    code: str


# ── Responses ─────────────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime
    is_2fa_enabled: bool = False


# ── Chats ─────────────────────────────────────────────────────────────────────

class ChatHistory(BaseModel):
    id: str
    title: str
    messages: List[dict]
    created_at: datetime
    updated_at: datetime

class ChatSave(BaseModel):
    id: str
    title: str
    messages: List[dict]


# ── Settings ──────────────────────────────────────────────────────────────────

class Set2FARequest(BaseModel):
    enabled: bool

class PasswordResetConfirm(BaseModel):
    """Step 2 of password change: email code + the new password."""
    code: str
    new_password: str


# ── NSTU cabinet sync ─────────────────────────────────────────────────────────

class CabinetParseRequest(BaseModel):
    page_type: str  # 'timetable' | 'profile'
    raw_text: str


class NstuLoginRequest(BaseModel):
    """One-click login / register via NSTU ID (email scraped from the cabinet)."""
    email: EmailStr


class SetPasswordRequest(BaseModel):
    """First-time BYTE password for NSTU-ID accounts that have an empty hash."""
    new_password: str


# Kept for backward-compat (internal use)
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
