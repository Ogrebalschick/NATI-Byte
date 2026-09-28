from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

from models import UserCreate, UserLogin, UserResponse, ChatSave
from database import get_db, User, Chat

load_dotenv()

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 дней

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/register", response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Проверка email на @stud.nstu.ru
    if not user_data.email.endswith("@stud.nstu.ru"):
        raise HTTPException(
            status_code=400,
            detail="Только почта @stud.nstu.ru разрешена для регистрации"
        )
    
    # Проверка существующего пользователя
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    
    # Создание пользователя
    hashed = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        password_hash=hashed,
        name=user_data.name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return UserResponse(
        id=db_user.id,
        email=db_user.email,
        name=db_user.name,
        created_at=db_user.created_at
    )

@router.post("/login")
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    token = create_access_token({"sub": user.email, "id": user.id})
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name
        }
    }

@router.get("/me")
def get_me(token: str, db: Session = Depends(get_db)):
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "created_at": user.created_at
    }

@router.post("/chats/save")
def save_chats(token: str, data: ChatSave, db: Session = Depends(get_db)):
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Обновляем или создаём чат
    chat = db.query(Chat).filter(Chat.id == data.id, Chat.user_id == user.id).first()
    if chat:
        chat.title = data.title
        chat.messages = data.messages
        chat.updated_at = datetime.utcnow()
    else:
        chat = Chat(
            id=data.id,
            user_id=user.id,
            title=data.title,
            messages=data.messages
        )
        db.add(chat)
    
    db.commit()
    return {"success": True}

@router.get("/chats")
def get_chats(token: str, db: Session = Depends(get_db)):
    payload = decode_token(token)
    user = db.query(User).filter(User.id == payload["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    chats = db.query(Chat).filter(Chat.user_id == user.id).all()
    return [
        {
            "id": chat.id,
            "title": chat.title,
            "messages": chat.messages,
            "created_at": chat.created_at,
            "updated_at": chat.updated_at
        }
        for chat in chats
    ]