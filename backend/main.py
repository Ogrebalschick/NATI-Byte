from fastapi import FastAPI
from dotenv import load_dotenv
import os
from langchain_gigachat import GigaChat
from langchain_core.messages import HumanMessage

load_dotenv()
app = FastAPI(title="Байт Бэкенд")

chat = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    model="GigaChat-2-Pro"  # 👈 используем одну из доступных моделей
)

@app.get("/")
def read_root():
    return {"message": "Сервер Байта успешно запущен!"}

@app.get("/ask")
def ask_bot(query: str):
    try:
        messages = [HumanMessage(content=query)]
        response = chat.invoke(messages)
        return {"question": query, "answer": response.content}
    except Exception as e:
        return {"error": str(e)}