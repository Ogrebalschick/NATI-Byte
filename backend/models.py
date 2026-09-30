from pydantic import BaseModel, EmailStr
from typing import Dict, List, Optional
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


# ── Manual subject score tracking ─────────────────────────────────────────────

class CustomSubjectCreate(BaseModel):
    name: str
    max_score: float
    target_score: float
    is_custom: bool = True


class ScoreLogCreate(BaseModel):
    score: float
    description: Optional[str] = None
    created_at: Optional[datetime] = None


class ScoreLogResponse(BaseModel):
    id: int
    subject_id: int
    score: float
    description: Optional[str] = None
    created_at: datetime


class CustomSubjectResponse(BaseModel):
    id: int
    user_id: int
    name: str
    max_score: float
    target_score: float
    is_custom: bool
    scores: List[ScoreLogResponse] = []


# ── Student notes ─────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    title: str = ""
    content: str = ""
    category: Optional[str] = None
    ai_classify: bool = False
    created_at: Optional[datetime] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    ai_classify: bool = False


class NoteResponse(BaseModel):
    id: int
    user_id: int
    title: str
    content: str
    category: str
    created_at: datetime
    updated_at: datetime


# ── AI memory / digital footprint ─────────────────────────────────────────────

class UserFactResponse(BaseModel):
    id: int
    user_id: int
    fact_text: str
    source: str
    created_at: datetime


class UserFactsGroupedResponse(BaseModel):
    """All facts the app stores about the student, grouped by origin."""
    groups: Dict[str, List[UserFactResponse]]


# Kept for backward-compat (internal use)
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
