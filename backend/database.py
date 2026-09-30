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
    # cascade="all, delete-orphan" ensures chats are deleted when user is deleted
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    messages = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="chats")


def _run_migrations() -> None:
    """Lightweight schema migration: add any missing columns to existing tables."""
    with engine.connect() as conn:
        inspector = sa_inspect(engine)

        # Add is_2fa_enabled to users if this is an existing DB without that column
        user_cols = [c["name"] for c in inspector.get_columns("users")]
        if "is_2fa_enabled" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0"))
            conn.commit()


# Create all tables (no-op if they already exist) then patch any missing columns
Base.metadata.create_all(bind=engine)
_run_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
