from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, ForeignKey, Boolean, text
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
    # cascade="all, delete-orphan" ensures chats / student data are deleted with the user
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")
    student_data = relationship("StudentData", back_populates="user", cascade="all, delete-orphan")


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


def _run_migrations() -> None:
    """Lightweight schema migration: add any missing columns to existing tables."""
    with engine.connect() as conn:
        inspector = sa_inspect(engine)

        user_cols = [c["name"] for c in inspector.get_columns("users")]
        patches = {
            "is_2fa_enabled": "ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0",
            "full_name": "ALTER TABLE users ADD COLUMN full_name VARCHAR",
            "student_group": "ALTER TABLE users ADD COLUMN student_group VARCHAR",
            "is_synced_with_nstu": "ALTER TABLE users ADD COLUMN is_synced_with_nstu BOOLEAN DEFAULT 0",
        }
        for col_name, ddl in patches.items():
            if col_name not in user_cols:
                conn.execute(text(ddl))
                conn.commit()
                print(f"[DB] Added missing column users.{col_name}")


# Create all tables (no-op if they already exist) then patch any missing columns
Base.metadata.create_all(bind=engine)
_run_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
