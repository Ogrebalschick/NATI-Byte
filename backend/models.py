from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Dict, List, Optional, Union
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
    device_name: Optional[str] = Field(default=None, max_length=120)


# ── Login / 2FA ───────────────────────────────────────────────────────────────

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_name: Optional[str] = Field(default=None, max_length=120)

class VerifyLogin(BaseModel):
    """2FA step: confirm the 6-digit code sent after a successful credential check."""
    email: EmailStr
    code: str
    device_name: Optional[str] = Field(default=None, max_length=120)


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
    device_name: Optional[str] = Field(default=None, max_length=120)


class UserSessionResponse(BaseModel):
    """One device where the account is currently signed in."""
    id: str
    device_name: str
    ip_address: Optional[str] = None
    last_active: datetime
    is_current: bool = False


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

class UserFactUpdate(BaseModel):
    fact_text: str


class UserFactsCreate(BaseModel):
    """Facts extracted from a chat reply. `source` is one of cabinet|chat|notes|grades."""
    facts: List[str]
    source: str = "chat"


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


# ── Task Manager ──────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class ProjectResponse(BaseModel):
    id: int
    user_id: int
    name: str
    color: str
    created_at: datetime

    class Config:
        from_attributes = True


class SectionCreate(BaseModel):
    project_id: int
    name: str
    position: int = 0


class SectionResponse(BaseModel):
    id: int
    project_id: int
    name: str
    position: int

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    """
    Создание задачи.

    project_id / section_id принимают:
      • int  — ID существующего проекта / раздела (проверяется право владения);
      • str  — название нового проекта / раздела, который будет создан на лету;
      • None — задача попадает во Входящие (без проекта / без раздела).

    due_date         — крайний срок сдачи (дедлайн).
    schedule_date    — дата и время, когда студент планирует выполнить задачу.
    duration_minutes — длительность работы над задачей в минутах (используется
                       для масштабирования карточки на почасовой сетке календаря).
    """
    title: str
    description: Optional[str] = ""
    project_id: Optional[Union[int, str]] = None
    section_id: Optional[Union[int, str]] = None
    due_date: Optional[datetime] = None
    schedule_date: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=30, ge=1, le=1440)
    priority: int = Field(default=4, ge=1, le=4)

    @field_validator('project_id', 'section_id', mode='before')
    @classmethod
    def _coerce_id_or_name(cls, v: object) -> Optional[Union[int, str]]:
        """
        Привести значение к правильному типу:
          • int / float → int (ID)
          • str из только цифр → int (ID, переданный как строка)
          • любая другая str → str (название для создания новой сущности)
          • None / пустая строка → None
        """
        if v is None:
            return None
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return int(v)
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                return None
            try:
                return int(stripped)
            except ValueError:
                return stripped
        return v


class TaskUpdate(BaseModel):
    """Частичное обновление задачи. Только переданные поля изменяются."""
    title: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    section_id: Optional[int] = None
    due_date: Optional[datetime] = None
    schedule_date: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    priority: Optional[int] = Field(default=None, ge=1, le=4)
    is_completed: Optional[bool] = None


class TaskResponse(BaseModel):
    id: int
    user_id: int
    project_id: Optional[int] = None
    section_id: Optional[int] = None
    title: str
    description: Optional[str] = ""
    due_date: Optional[datetime] = None
    schedule_date: Optional[datetime] = None
    duration_minutes: Optional[int] = 30
    priority: int
    is_completed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SectionWithTasksResponse(BaseModel):
    """Section enriched with its tasks — used inside the data tree."""
    id: int
    project_id: int
    name: str
    position: int
    tasks: List[TaskResponse] = []

    class Config:
        from_attributes = True


class ProjectWithDataResponse(BaseModel):
    """Project enriched with sections+tasks — the full tree node."""
    id: int
    user_id: int
    name: str
    color: str
    created_at: datetime
    sections: List[SectionWithTasksResponse] = []
    inbox_tasks: List[TaskResponse] = []  # tasks that belong to the project but have no section

    class Config:
        from_attributes = True


class TodosDataResponse(BaseModel):
    """Full task-manager snapshot for the authenticated user."""
    projects: List[ProjectWithDataResponse] = []
    inbox_tasks: List[TaskResponse] = []  # tasks with no project at all
