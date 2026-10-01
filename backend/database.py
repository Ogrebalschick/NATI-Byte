from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, ForeignKey, Boolean, Float, Text, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy import inspect as sa_inspect
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./byte.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_2fa_enabled = Column(Boolean, default=False)
    full_name = Column(String, nullable=True)
    student_group = Column(String, nullable=True)
    is_synced_with_nstu = Column(Boolean, default=False)
    # Personal biorhythm clock, Novosibirsk local time, "HH:MM".
    wake_time = Column(String, nullable=False, default="08:00")
    sleep_time = Column(String, nullable=False, default="22:30")
    # cascade="all, delete-orphan" ensures related rows are deleted with the user
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")
    student_data = relationship("StudentData", back_populates="user", cascade="all, delete-orphan")
    custom_subjects = relationship("CustomSubject", back_populates="user", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="user", cascade="all, delete-orphan")
    facts = relationship("UserFact", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    messages = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="chats")


class StudentData(Base):
    """Parsed snapshots imported from the NSTU student cabinet (ciu.nstu.ru)."""
    __tablename__ = "student_data"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    data_type = Column(String, index=True)  # 'timetable' | 'profile'
    payload = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="student_data")


class CustomSubject(Base):
    """Student-defined course used for manual score tracking."""
    __tablename__ = "custom_subjects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    name = Column(String, nullable=False)
    max_score = Column(Float, nullable=False)
    target_score = Column(Float, nullable=False)
    is_custom = Column(Boolean, default=True, nullable=False)
    user = relationship("User", back_populates="custom_subjects")
    scores = relationship("ScoreLog", back_populates="subject", cascade="all, delete-orphan")


class ScoreLog(Base):
    """One manual score entry attached to a custom subject."""
    __tablename__ = "score_logs"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("custom_subjects.id"), index=True, nullable=False)
    score = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    subject = relationship("CustomSubject", back_populates="scores")


class Note(Base):
    """Student markdown note. `category` is one label, or several joined by a comma."""
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String, nullable=False, default="")
    content = Column(Text, nullable=False, default="")
    category = Column(String, nullable=False, default="Разное")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    user = relationship("User", back_populates="notes")


class UserFact(Base):
    """One piece of AI memory about the student. The owner can read and delete it."""
    __tablename__ = "user_facts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    fact_text = Column(String, nullable=False)
    source = Column(String, index=True, nullable=False)  # cabinet | chat | notes | grades
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    user = relationship("User", back_populates="facts")


class UserSession(Base):
    """One logged-in device. Deleting the row invalidates that device's JWT."""
    __tablename__ = "user_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    device_name = Column(String, nullable=False, default="Неизвестное устройство")
    ip_address = Column(String, nullable=True)
    last_active = Column(DateTime, default=datetime.utcnow, nullable=False)
    user = relationship("User", back_populates="sessions")


# ── Task Manager ──────────────────────────────────────────────────────────────

class Project(Base):
    """Top-level container owned by a user (e.g. 'Учёба', 'Личное')."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#6366f1")  # hex color
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="projects")
    sections = relationship("Section", back_populates="project", cascade="all, delete-orphan", order_by="Section.position")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")


class Section(Base):
    """Named group inside a project (e.g. '1 семестр', 'Лабораторные')."""
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    name = Column(String, nullable=False)
    position = Column(Integer, nullable=False, default=0)

    project = relationship("Project", back_populates="sections")
    tasks = relationship("Task", back_populates="section", cascade="all, delete-orphan")


class Task(Base):
    """A single to-do item. Can live in a project and/or section."""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="CASCADE"), nullable=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True, default="")
    due_date = Column(DateTime, nullable=True)        # Дедлайн (крайний срок сдачи)
    schedule_date = Column(DateTime, nullable=True)   # Дата выполнения (когда планируется делать)
    duration_minutes = Column(Integer, nullable=True, default=30)  # Длительность в минутах (для сетки календаря)
    priority = Column(Integer, nullable=False, default=4)  # 1 (highest) – 4 (lowest)
    is_completed = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="tasks")
    project = relationship("Project", back_populates="tasks")
    section = relationship("Section", back_populates="tasks")


# ── Notification system ───────────────────────────────────────────────────────

# Valid category values (stored as plain strings for SQLite compat).
NOTIFICATION_CATEGORIES = ("tasks", "reminders", "wishes")


class Notification(Base):
    """
    In-app notification for a user.

    Categories
    ──────────
    • tasks     — deadline / overdue reminders generated from Task data.
    • reminders — study reminders set by the user or auto-scheduler.
    • wishes    — motivational / greeting messages ("Доброго утра!").

    Lifecycle: created by the backend (scheduled jobs or event hooks),
    consumed by the client which marks them read individually or all-at-once.
    """
    __tablename__ = "notifications"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title      = Column(String, nullable=False)
    body       = Column(Text, nullable=False, default="")
    # One of NOTIFICATION_CATEGORIES; kept as plain VARCHAR for SQLite flexibility.
    category   = Column(String, nullable=False, default="tasks", index=True)
    # Relative URL of a meme/illustration, e.g. "/static/memes/cat.png".
    image_url  = Column(String, nullable=True)
    # "morning" (08:00 wishes) | "evening" (22:30 support) | NULL for other cards.
    push_slot  = Column(String, nullable=True, index=True)
    is_read    = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="notifications")


def _run_migrations() -> None:
    """Lightweight schema migration: create missing tables and add missing columns."""
    # create_all is idempotent and will add new tables without dropping existing data.
    Base.metadata.create_all(bind=engine)

    with engine.connect() as conn:
        inspector = sa_inspect(engine)

        user_cols = [c["name"] for c in inspector.get_columns("users")]
        patches = {
            "is_2fa_enabled": "ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0",
            "full_name": "ALTER TABLE users ADD COLUMN full_name VARCHAR",
            "student_group": "ALTER TABLE users ADD COLUMN student_group VARCHAR",
            "is_synced_with_nstu": "ALTER TABLE users ADD COLUMN is_synced_with_nstu BOOLEAN DEFAULT 0",
            "wake_time": "ALTER TABLE users ADD COLUMN wake_time VARCHAR DEFAULT '08:00'",
            "sleep_time": "ALTER TABLE users ADD COLUMN sleep_time VARCHAR DEFAULT '22:30'",
        }
        for col_name, ddl in patches.items():
            if col_name not in user_cols:
                conn.execute(text(ddl))
                conn.commit()
                print(f"[DB] Added missing column users.{col_name}")

        tables = inspector.get_table_names()
        if "custom_subjects" in tables:
            subject_cols = [c["name"] for c in inspector.get_columns("custom_subjects")]
            subject_patches = {
                "is_custom": "ALTER TABLE custom_subjects ADD COLUMN is_custom BOOLEAN DEFAULT 1",
            }
            for col_name, ddl in subject_patches.items():
                if col_name not in subject_cols:
                    conn.execute(text(ddl))
                    conn.commit()
                    print(f"[DB] Added missing column custom_subjects.{col_name}")

        if "notes" in tables:
            note_cols = [c["name"] for c in inspector.get_columns("notes")]
            note_patches = {
                "title": "ALTER TABLE notes ADD COLUMN title VARCHAR DEFAULT ''",
                "content": "ALTER TABLE notes ADD COLUMN content TEXT DEFAULT ''",
                "category": "ALTER TABLE notes ADD COLUMN category VARCHAR DEFAULT 'Разное'",
                "created_at": "ALTER TABLE notes ADD COLUMN created_at DATETIME",
                "updated_at": "ALTER TABLE notes ADD COLUMN updated_at DATETIME",
                "user_id": "ALTER TABLE notes ADD COLUMN user_id INTEGER",
            }
            for col_name, ddl in note_patches.items():
                if col_name not in note_cols:
                    conn.execute(text(ddl))
                    conn.commit()
                    print(f"[DB] Added missing column notes.{col_name}")

        if "user_sessions" in tables:
            session_cols = [c["name"] for c in inspector.get_columns("user_sessions")]
            session_patches = {
                "user_id": "ALTER TABLE user_sessions ADD COLUMN user_id INTEGER",
                "device_name": "ALTER TABLE user_sessions ADD COLUMN device_name VARCHAR",
                "ip_address": "ALTER TABLE user_sessions ADD COLUMN ip_address VARCHAR",
                "last_active": "ALTER TABLE user_sessions ADD COLUMN last_active DATETIME",
            }
            for col_name, ddl in session_patches.items():
                if col_name not in session_cols:
                    conn.execute(text(ddl))
                    conn.commit()
                    print(f"[DB] Added missing column user_sessions.{col_name}")

        if "user_facts" in tables:
            fact_cols = [c["name"] for c in inspector.get_columns("user_facts")]
            fact_patches = {
                "user_id": "ALTER TABLE user_facts ADD COLUMN user_id INTEGER",
                "fact_text": "ALTER TABLE user_facts ADD COLUMN fact_text VARCHAR",
                "source": "ALTER TABLE user_facts ADD COLUMN source VARCHAR",
                "created_at": "ALTER TABLE user_facts ADD COLUMN created_at DATETIME",
            }
            for col_name, ddl in fact_patches.items():
                if col_name not in fact_cols:
                    conn.execute(text(ddl))
                    conn.commit()
                    print(f"[DB] Added missing column user_facts.{col_name}")

        # ── Task Manager tables ────────────────────────────────────────────────
        if "tasks" in tables:
            task_cols = [c["name"] for c in inspector.get_columns("tasks")]
            task_patches = {
                "description":       "ALTER TABLE tasks ADD COLUMN description TEXT DEFAULT ''",
                "due_date":          "ALTER TABLE tasks ADD COLUMN due_date DATETIME",
                "schedule_date":     "ALTER TABLE tasks ADD COLUMN schedule_date DATETIME",
                "duration_minutes":  "ALTER TABLE tasks ADD COLUMN duration_minutes INTEGER DEFAULT 30",
                "priority":          "ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 4",
                "is_completed":      "ALTER TABLE tasks ADD COLUMN is_completed BOOLEAN DEFAULT 0",
                "project_id":        "ALTER TABLE tasks ADD COLUMN project_id INTEGER",
                "section_id":        "ALTER TABLE tasks ADD COLUMN section_id INTEGER",
                "updated_at":        "ALTER TABLE tasks ADD COLUMN updated_at DATETIME",
            }
            for col_name, ddl in task_patches.items():
                if col_name not in task_cols:
                    conn.execute(text(ddl))
                    conn.commit()
                    print(f"[DB] Added missing column tasks.{col_name}")

        if "projects" in tables:
            proj_cols = [c["name"] for c in inspector.get_columns("projects")]
            proj_patches = {
                "color": "ALTER TABLE projects ADD COLUMN color VARCHAR DEFAULT '#6366f1'",
            }
            for col_name, ddl in proj_patches.items():
                if col_name not in proj_cols:
                    conn.execute(text(ddl))
                    conn.commit()
                    print(f"[DB] Added missing column projects.{col_name}")

        # ── Notification table ─────────────────────────────────────────────────
        # The table is created by create_all above; patches guard future schema changes.
        if "notifications" in tables:
            notif_cols = [c["name"] for c in inspector.get_columns("notifications")]
            notif_patches: dict[str, str] = {
                "image_url": "ALTER TABLE notifications ADD COLUMN image_url VARCHAR",
                "push_slot": "ALTER TABLE notifications ADD COLUMN push_slot VARCHAR",
            }
            for col_name, ddl in notif_patches.items():
                if col_name not in notif_cols:
                    conn.execute(text(ddl))
                    conn.commit()
                    print(f"[DB] Added missing column notifications.{col_name}")


# Create all tables (no-op if they already exist) then patch any missing columns
Base.metadata.create_all(bind=engine)
_run_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
