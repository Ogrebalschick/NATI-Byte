from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime

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