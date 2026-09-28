from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
import os
from langchain_gigachat import GigaChat
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from auth import router as auth_router

load_dotenv()
app = FastAPI(title="Байт Бэкенд")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роуты аутентификации
app.include_router(auth_router)

chat = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    model="GigaChat-2-Pro"
)

class Message(BaseModel):
    role: str
    content: str

class AskRequest(BaseModel):
    messages: List[Message]

@app.get("/")
def read_root():
    return {"message": "Сервер Байта успешно запущен!"}

@app.post("/ask")
def ask_bot(request: AskRequest):
    try:
        gigachat_messages = []
        for msg in request.messages:
            if msg.role == "user":
                gigachat_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                gigachat_messages.append(AIMessage(content=msg.content))
            elif msg.role == "system":
                gigachat_messages.append(SystemMessage(content=msg.content))

        response = chat.invoke(gigachat_messages)
        return {"answer": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))