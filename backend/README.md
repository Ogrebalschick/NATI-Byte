# Бэкенд проекта «Байт»

HTTP API для мобильного приложения «Байт». Сервер хранит учётные записи студентов, разбирает страницы личного кабинета НГТУ, ведёт дела, заметки, факты и ленту уведомлений. Ответы чата, категории заметок, разбор кабинета и тексты утренних и вечерних карточек запрашиваются у GigaChat.

Общее описание проекта: [README в корне](../README.md). Клиент: [frontend/README.md](../frontend/README.md).

![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-uvicorn-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-SQLAlchemy-003B57?logo=sqlite&logoColor=white)
![Лицензия](https://img.shields.io/badge/license-MIT-green)

## Технологии

| Компонент | Как используется |
| --- | --- |
| Python | 3.12+. В `requirements.txt` версии пакетов не зафиксированы |
| FastAPI | Приложение в `main.py`, заголовок «Байт Бэкенд» |
| Uvicorn | ASGI-сервер для разработки |
| Pydantic | Схемы тел запросов и ответов в `models.py` |
| SQLAlchemy | Модели таблиц и сессии в `database.py` |
| SQLite | База по умолчанию, файл `byte.db` |
| GigaChat API | Пакет `langchain-gigachat`, модель `GigaChat-2-Pro` |
| python-jose | JWT, алгоритм HS256, срок токена 7 суток |
| passlib[bcrypt] | Хеш пароля |
| python-dotenv | Чтение `.env` |
| venv | Виртуальное окружение. Менеджер `uv` в репозитории не используется |

Пакеты перечислены в `requirements.txt` без закреплённых версий.

## Структура файлов

Каталог `backend/`:

```text
backend/
├── main.py
├── auth.py
├── database.py
├── models.py
├── parser.py
├── subjects.py
├── notes.py
├── facts.py
├── todos.py
├── notifications.py
├── wishes.py
├── requirements.txt
├── Instructions.txt
└── static/
    └── memes/
```

| Файл | Назначение |
| --- | --- |
| `main.py` | Создание приложения, CORS, подключение маршрутов, раздача `static/`, жизненный цикл планировщика карточек, `GET /` и `POST /ask` |
| `auth.py` | Маршруты `/auth`: регистрация с кодом на почту, вход, двухфакторная проверка, сессии, смена и сброс пароля |
| `database.py` | Слой базы: таблицы SQLAlchemy, `create_all` и дополнение недостающих колонок при старте |
| `models.py` | Модели данных Pydantic для запросов и ответов |
| `parser.py` | Парсер текста страниц личного кабинета НГТУ (`ciu.nstu.ru`). Маршруты с префиксом `/sync`. Структуру извлекает GigaChat |
| `facts.py` | Факты о студенте: чтение, правка и удаление. Префикс `/profile` |
| `wishes.py` | Промпты и логика утренних и вечерних пожеланий через GigaChat, запрос погоды Open-Meteo, планировщик по минутам Новосибирска |
| `subjects.py` | Ручные предметы и журнал баллов. Префикс `/subjects` |
| `notes.py` | Заметки и необязательная автокатегория через GigaChat. Префикс `/notes` |
| `todos.py` | Проекты, разделы и задачи. Префикс `/todos` |
| `notifications.py` | Лента уведомлений, счётчик непрочитанных, отметка прочтения, разовая генерация карточки. Префикс `/notifications` |
| `requirements.txt` | Список зависимостей pip |
| `Instructions.txt` | Короткая памятка: активация окружения и команда `uvicorn` |
| `static/memes/` | Картинки, которые могут прикладываться к карточкам. Каталог создаётся при старте |

## Установка

Из корня репозитория:

```bash
cd backend
python -m venv venv
```

Windows (cmd):

```bat
venv\Scripts\activate
pip install -r requirements.txt
```

Windows (PowerShell):

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS и Linux:

```bash
source venv/bin/activate
pip install -r requirements.txt
```

Каталоги `venv/`, `.venv/` и `backend/.env` перечислены в корневом `.gitignore`.

## Конфигурация

Создайте файл `backend/.env`. Реальные ключи в репозиторий не кладите.

```env
GIGACHAT_CREDENTIALS=ключ_из_личного_кабинета_GigaChat
SECRET_KEY=длинная_случайная_строка
DATABASE_URL=sqlite:///./byte.db

SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_USE_SSL=True
SMTP_USE_TLS=False
SMTP_USER=почта@mail.ru
SMTP_PASSWORD=пароль_приложения
SMTP_FROM=почта@mail.ru
```

| Переменная | Обязательна | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `SECRET_KEY` | да | нет | Подпись JWT. Если переменная пустая, импорт `auth.py` завершается с `RuntimeError` |
| `GIGACHAT_CREDENTIALS` | для функций с моделью | нет | Ключ GigaChat для `/ask`, разбора кабинета, заметок и карточек |
| `DATABASE_URL` | нет | `sqlite:///./byte.db` | Строка подключения SQLAlchemy |
| `SMTP_HOST` | нет | `smtp.mail.ru` | Сервер исходящей почты |
| `SMTP_PORT` | нет | `465` | Порт SMTP |
| `SMTP_USE_SSL` | нет | `True` | Неявный SSL, как у Mail.ru и Яндекса |
| `SMTP_USE_TLS` | нет | `False` | STARTTLS, например порт 587 |
| `SMTP_USER` | для писем | пусто | Логин ящика |
| `SMTP_PASSWORD` | для писем | пусто | Пароль. Старое имя `SMTP_PASS` тоже читается |
| `SMTP_FROM` | нет | значение `SMTP_USER` | Адрес отправителя |

Коды подтверждения регистрации, входа и смены пароля живут в памяти процесса 10 минут и пропадают после перезапуска.

## Запуск

Команду выполняйте из каталога `backend`, чтобы файл базы создался рядом с кодом, а не в корне репозитория.

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Адрес на этом компьютере: [http://localhost:8000](http://localhost:8000)
- `--reload` перезапускает процесс при изменении кода. Для постоянной работы его убирают.
- `--host 0.0.0.0` принимает запросы с телефона в той же сети.

Проверка:

```bash
curl http://localhost:8000/
```

Ожидаемый ответ: `{"message":"Сервер Байта успешно запущен!"}`.

Чат без авторизации: `POST /ask` с телом `{"messages":[{"role":"user","content":"Привет"}]}`. Нужен рабочий `GIGACHAT_CREDENTIALS`.

## API-документация

Интерактивная документация поднимается вместе с приложением. В `main.py` она не отключена.

| Адрес | Формат |
| --- | --- |
| [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI |
| [http://localhost:8000/redoc](http://localhost:8000/redoc) | ReDoc |
| [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json) | Схема OpenAPI |

Основные группы маршрутов: `/auth`, `/sync`, `/subjects`, `/notes`, `/profile`, `/todos`, `/notifications`, а также `POST /ask`.

Большинство методов, кроме регистрации, входа и `/ask`, требуют заголовок `Authorization: Bearer <token>`.

## База данных

Движок создаётся в `database.py`:

```text
DATABASE_URL = sqlite:///./byte.db
```

Путь относительный: файл появляется в том каталоге, откуда запущен Uvicorn. При запуске из `backend/` это `backend/byte.db`. Файл в корне репозитория означает, что сервер когда-то стартовали не из `backend/`.

Отдельная команда инициализации не нужна. При импорте модуля вызываются `Base.metadata.create_all` и добавление недостающих колонок. Существующие строки не удаляются.

Таблицы описывают пользователя, чаты, данные студента из кабинета, предметы и баллы, заметки, факты, сессии, проекты, задачи и уведомления. Удаление пользователя удаляет связанные строки каскадом.

`byte.db` хранит локальные данные и в коммит не добавляется.

Картинки карточек лежат отдельно от базы, в `backend/static/memes/`, и отдаются по пути `/static/...`.

## Проверка после запуска

1. Открыть [http://localhost:8000/docs](http://localhost:8000/docs).
2. Вызвать `GET /` и убедиться, что сервер отвечает.
3. Пройти регистрацию и вход, если настроена почта.
4. Вызвать защищённый метод с Bearer-токеном.
