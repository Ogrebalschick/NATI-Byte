from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
import os
from langchain_gigachat import GigaChat
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

load_dotenv()
app = FastAPI(title="Байт Бэкенд")

chat = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    model="GigaChat-2-Pro"   # или "GigaChat"
)

# Модель для входящего запроса
class Message(BaseModel):
    role: str   # "user" или "assistant" (можно также "system")
    content: str

class AskRequest(BaseModel):
    messages: List[Message]

@app.get("/")
def read_root():
    return {"message": "Сервер Байта успешно запущен!"}

@app.post("/ask")
def ask_bot(request: AskRequest):
    try:
        # Преобразуем список сообщений в формат GigaChat
        # GigaChat ожидает список объектов BaseMessage (HumanMessage, SystemMessage, AIMessage)
        gigachat_messages = []
        for msg in request.messages:
            if msg.role == "user":
                gigachat_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                gigachat_messages.append(AIMessage(content=msg.content))
            elif msg.role == "system":
                gigachat_messages.append(SystemMessage(content=msg.content))
            # если role другое, можно игнорировать или добавить как HumanMessage

        # Если нужно добавить системный промпт, можно вставить в начало:
        # gigachat_messages.insert(0, SystemMessage(content="Ты — Байт, дружелюбный помощник."))

        response = chat.invoke(gigachat_messages)
        return {"answer": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))