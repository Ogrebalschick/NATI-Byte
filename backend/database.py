import os
from dotenv import load_dotenv
from langchain_gigachat import GigaChat
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document

# Правильные импорты для LangChain 1.x
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain

load_dotenv()
credentials = os.getenv("GIGACHAT_CREDENTIALS")

# 1. Генерация через GigaChat
llm = GigaChat(
    credentials=credentials,
    verify_ssl_certs=False,
    model="GigaChat",
    temperature=0.3
)

# 2. Локальные эмбеддинги (бесплатно)
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

PERSIST_DIR = "./chroma_db"

def get_vector_store():
    if os.path.exists(PERSIST_DIR) and os.listdir(PERSIST_DIR):
        return Chroma(
            embedding_function=embeddings,
            persist_directory=PERSIST_DIR
        )
    else:
        dummy = Document(page_content="Заглушка – информации пока нет.", metadata={})
        store = Chroma.from_documents(
            [dummy],
            embeddings,
            persist_directory=PERSIST_DIR
        )
        store.persist()
        return store

vector_store = get_vector_store()

system_prompt = (
    "Ты — Байт, дружелюбный цифровой помощник студента НГТУ НЭТИ. "
    "Отвечай четко и по делу. "
    "Используй ТОЛЬКО приведенный ниже контекст для ответа на вопрос. "
    "Если в контексте нет ответа, так и скажи: 'К сожалению, у меня нет точной информации об этом. "
    "Обратитесь в деканат или посмотрите на сайте nstu.ru.'\n\n"
    "Контекст:\n{context}"
)

prompt_template = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
])

def get_rag_chain():
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})
    # Создаём цепочку для обработки документов
    question_answer_chain = create_stuff_documents_chain(llm, prompt_template)
    # Создаём RAG-цепочку: сначала поиск, потом генерация
    rag_chain = create_retrieval_chain(retriever, question_answer_chain)
    return rag_chain