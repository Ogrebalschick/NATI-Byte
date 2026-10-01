"""
Smart wishes for BYTE students.

Morning cards (push_slot="morning", category="wishes") are generated at 08:00
Asia/Novosibirsk. Evening cards (push_slot="evening", category="reminders")
are generated at 22:30. Both land in the Notification feed.

The in-process scheduler starts with the FastAPI app. It does not send an OS
push by itself: the mobile client reads the new row from GET /notifications.

Pictures are optional and must already live in backend/static/memes/
(cats, meme_2, meme_3, meme_5, or any other image dropped into that folder).
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import threading
import urllib.request
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_gigachat import GigaChat
from sqlalchemy.orm import Session

from database import Notification, SessionLocal, Task, User, UserFact

load_dotenv()

# Novosibirsk has not observed DST since 2011, so a fixed UTC+7 offset is enough
# and does not depend on the Windows tzdata package.
NOVOSIBIRSK = timezone(timedelta(hours=7))
NOVOSIBIRSK_LAT = 55.0415
NOVOSIBIRSK_LON = 82.9346

MEMES_DIR = Path(__file__).resolve().parent / "static" / "memes"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# WMO weather codes that mean drizzle, rain, showers, or a thunderstorm.
RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
RAIN_LINE = "Сегодня будет дождик. Не забудь зонтик! ☔"

MORNING_TITLES = {
    "cute": "Доброе утро",
    "prediction": "Предсказание на день",
    "holiday": "Праздник дня",
}
MORNING_FALLBACKS = {
    "cute": "Доброе утро! Пусть сегодняшний день будет тёплым и лёгким 💛",
    "prediction": "У тебя будет прекрасный день!",
    "holiday": "Поздравляю с неофициальным праздником — Днём торта! Пусть день будет сладким 🍰",
}
EVENING_DONE = "Умничка! Ты выполнила все задачи на день. Отдыхай! 🌟"
EVENING_SUPPORT = "Я с тобой. Ты всё делаешь правильно. Обнимаю! 🤗"
EVENING_REST = (
    "Я с тобой. Если день был тяжёлым — почитай книгу или включи спокойную музыку. Обнимаю! 🤗"
)

_MONTHS = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)
_WEEKDAYS = ("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")

_giga = GigaChat(
    credentials=os.getenv("GIGACHAT_CREDENTIALS"),
    verify_ssl_certs=False,
    model="GigaChat-2-Pro",
)

_scheduler_task: asyncio.Task | None = None
_dispatch_lock = threading.Lock()
_dispatch_busy = False


def _now_local() -> datetime:
    return datetime.now(NOVOSIBIRSK)


def _local_day_utc_bounds(moment: datetime | None = None) -> tuple[datetime, datetime]:
    """UTC-naive [start, end) of the Novosibirsk calendar day containing *moment*."""
    local = moment.astimezone(NOVOSIBIRSK) if moment else _now_local()
    start_local = datetime.combine(local.date(), time.min, tzinfo=NOVOSIBIRSK)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def _as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _today_label() -> str:
    now = _now_local()
    return f"{now.day} {_MONTHS[now.month - 1]} {now.year}, {_WEEKDAYS[now.weekday()]}"


def _clip(text: str, limit: int = 700) -> str:
    compact = " ".join((text or "").split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _meme_files() -> list[str]:
    if not MEMES_DIR.is_dir():
        return []
    names = [
        path.name
        for path in MEMES_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]
    return sorted(names)


def _image_url(name: str | None, allowed: set[str]) -> str | None:
    if not name or not isinstance(name, str):
        return None
    candidate = Path(name.strip()).name
    if candidate not in allowed:
        return None
    return f"/static/memes/{candidate}"


def novosibirsk_expects_rain() -> bool:
    """
    True when Open-Meteo's daily forecast for Novosibirsk looks wet.

    A network or parse failure returns False so a wish is still delivered,
    just without the umbrella line.
    """
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={NOVOSIBIRSK_LAT}&longitude={NOVOSIBIRSK_LON}"
        "&daily=weather_code,precipitation_probability_max,precipitation_sum"
        "&timezone=Asia%2FNovosibirsk"
        "&forecast_days=1"
    )
    try:
        with urllib.request.urlopen(url, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"[WISHES] weather lookup failed: {exc}")
        return False

    daily = payload.get("daily") or {}
    codes = daily.get("weather_code") or []
    probabilities = daily.get("precipitation_probability_max") or []
    amounts = daily.get("precipitation_sum") or []
    code = codes[0] if codes else None
    probability = probabilities[0] if probabilities else 0
    amount = amounts[0] if amounts else 0
    if isinstance(code, int) and code in RAIN_CODES:
        return True
    if isinstance(probability, (int, float)) and probability >= 50:
        return True
    if isinstance(amount, (int, float)) and amount >= 0.5:
        return True
    return False


def _facts_text(db: Session, user: User) -> str:
    rows = (
        db.query(UserFact)
        .filter(UserFact.user_id == user.id)
        .order_by(UserFact.created_at.desc())
        .limit(30)
        .all()
    )
    lines = [row.fact_text.strip() for row in rows if (row.fact_text or "").strip()]
    header = (
        f"Имя: {user.name or 'не указано'}. "
        f"ФИО: {user.full_name or 'не указано'}. "
        f"Группа: {user.student_group or 'не указана'}."
    )
    if not lines:
        return header + "\nСохранённых фактов о студенте пока нет."
    bullets = "\n".join(f"- {line}" for line in lines)
    return header + "\nФакты:\n" + bullets


def _extract_json(raw: str) -> dict:
    cleaned = (raw or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no json object")
    payload = json.loads(cleaned[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("json is not an object")
    return payload


def _ask_gigachat(system_prompt: str, human_prompt: str) -> str:
    response = _giga.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ]
    )
    return getattr(response, "content", "") or ""


def _parse_card(raw: str, fallback_body: str, allowed: set[str]) -> tuple[str, str | None]:
    body = ""
    image = None
    try:
        payload = _extract_json(raw)
        body = str(payload.get("body") or "").strip()
        image = payload.get("image")
    except (json.JSONDecodeError, ValueError, TypeError):
        body = (raw or "").strip().strip('"')
    if not body:
        body = fallback_body
    return _clip(body), _image_url(image if isinstance(image, str) else None, allowed)


def _tasks_for_local_today(db: Session, user_id: int) -> list[Task]:
    start, end = _local_day_utc_bounds()
    rows = db.query(Task).filter(Task.user_id == user_id).all()
    today: list[Task] = []
    for task in rows:
        stamps = [task.due_date, task.schedule_date]
        if any(stamp is not None and start <= _as_naive_utc(stamp) < end for stamp in stamps):
            today.append(task)
    return today


def _save_notification(
    db: Session,
    *,
    user_id: int,
    title: str,
    body: str,
    category: str,
    push_slot: str,
    image_url: str | None,
) -> dict:
    notif = Notification(
        user_id=user_id,
        title=title[:200],
        body=body[:2000],
        category=category,
        image_url=image_url,
        push_slot=push_slot,
        is_read=False,
        created_at=datetime.utcnow(),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return {
        "id": notif.id,
        "user_id": notif.user_id,
        "title": notif.title,
        "body": notif.body,
        "category": notif.category,
        "image_url": notif.image_url,
        "push_slot": notif.push_slot,
        "is_read": notif.is_read,
        "created_at": notif.created_at,
    }


def _load_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise LookupError("Пользователь не найден")
    return user


def generate_morning_wish(user_id: int) -> dict:
    """
    Build one morning card for *user_id* and store it as category="wishes".

    GigaChat picks a single variation (cute wish, day prediction, or a joke
    unofficial holiday) using UserFact memory. When Novosibirsk expects rain,
    the body includes the umbrella sentence. push_slot is "morning".
    """
    db = SessionLocal()
    try:
        user = _load_user(db, user_id)
        variation = random.choice(("cute", "prediction", "holiday"))
        rain = novosibirsk_expects_rain()
        files = _meme_files()
        allowed = set(files)
        fallback = MORNING_FALLBACKS[variation]
        if rain and RAIN_LINE not in fallback:
            fallback = f"{fallback} {RAIN_LINE}"

        file_line = ", ".join(files) if files else "нет"
        variation_help = {
            "cute": "Милое короткое пожелание на день с эмодзи.",
            "prediction": "Лёгкое предсказание на день, в духе «У тебя будет прекрасный день!».",
            "holiday": (
                "Шуточное поздравление с неофициальным праздником "
                "(День торта, День апельсина или другой выдуманный на эту дату)."
            ),
        }[variation]
        system_prompt = (
            "Ты Byte, тёплый помощник студента НГТУ. Пиши по-русски, на «ты», "
            "1–2 коротких предложения, без markdown и без кавычек вокруг текста. "
            "Согласуй род с полом студента, если он следует из имени или фактов. "
            "Если пол неизвестен, не выдумывай его и говори нейтрально. "
            "Верни ТОЛЬКО JSON: {\"body\": \"текст\", \"image\": \"имя_файла_или_null\"}. "
            "image — точное имя из списка файлов или null. Не выдумывай файлы."
        )
        human_prompt = (
            f"Вариация: {variation}. {variation_help}\n"
            f"Сегодня: {_today_label()}.\n"
            f"Дождь в Новосибирске: {'да' if rain else 'нет'}.\n"
            + (
                f"Если дождь да, body ОБЯЗАН содержать фразу: {RAIN_LINE}\n"
                if rain
                else "Про дождь и зонт не пиши.\n"
            )
            + f"Файлы картинок (котики и мемы): {file_line}\n"
            "Если уместно, прикрепи одну картинку из списка, иначе image = null.\n\n"
            f"{_facts_text(db, user)}"
        )
        try:
            raw = _ask_gigachat(system_prompt, human_prompt)
            body, image_url = _parse_card(raw, fallback, allowed)
        except Exception as exc:
            print(f"[WISHES] morning GigaChat failed for user {user_id}: {exc}")
            body, image_url = _clip(fallback), None

        if rain and RAIN_LINE not in body:
            body = _clip(f"{body} {RAIN_LINE}")

        print(f"[WISHES] morning variation={variation} rain={rain} user={user_id}")
        return _save_notification(
            db,
            user_id=user.id,
            title=MORNING_TITLES[variation],
            body=body,
            category="wishes",
            push_slot="morning",
            image_url=image_url,
        )
    finally:
        db.close()


def generate_evening_wish(user_id: int) -> dict:
    """
    Build one bedtime card for *user_id* and store it as category="reminders".

    If every task dated today (due_date or schedule_date, Novosibirsk day) is
    completed, the card praises the student. Otherwise it supports them and may
    suggest a book or calm music. push_slot is "evening".
    """
    db = SessionLocal()
    try:
        user = _load_user(db, user_id)
        tasks = _tasks_for_local_today(db, user_id)
        done = [task for task in tasks if task.is_completed]
        open_tasks = [task for task in tasks if not task.is_completed]
        all_done = bool(tasks) and not open_tasks
        files = _meme_files()
        allowed = set(files)
        file_line = ", ".join(files) if files else "нет"

        if all_done:
            title = "Умничка"
            fallback = EVENING_DONE
            mode_help = (
                f"Студент закрыл все задачи на сегодня ({len(done)} из {len(tasks)}). "
                "Похвали тепло и отпусти отдыхать. Ориентир по тексту: "
                f"«{EVENING_DONE}». Согласуй род глагола с полом, если он известен."
            )
        elif open_tasks:
            title = "Я с тобой"
            fallback = random.choice((EVENING_SUPPORT, EVENING_REST))
            names = ", ".join(task.title.strip() for task in open_tasks[:8] if task.title)
            mode_help = (
                f"На сегодня остались незакрытые задачи ({len(open_tasks)} из {len(tasks)}): {names}. "
                "Не ругай. Поддержи: «Я с тобой. Ты всё делаешь правильно. Обнимаю! 🤗» "
                "или мягко предложи почитать книгу / послушать спокойную музыку."
            )
        else:
            title = "Перед сном"
            fallback = EVENING_REST
            mode_help = (
                "Задач на сегодня не было. Не хвали за пустой список. "
                "Коротко поддержи и предложи отдых, книгу или спокойную музыку."
            )

        system_prompt = (
            "Ты Byte, тёплый помощник студента НГТУ. Вечернее сообщение перед сном. "
            "Пиши по-русски, на «ты», 1–2 коротких предложения, без markdown. "
            "Согласуй род с полом студента, если он следует из имени или фактов. "
            "Если пол неизвестен, используй формулировку из ориентира. "
            "Верни ТОЛЬКО JSON: {\"body\": \"текст\", \"image\": \"имя_файла_или_null\"}. "
            "image — точное имя из списка файлов или null. Не выдумывай файлы."
        )
        human_prompt = (
            f"Сегодня: {_today_label()}.\n"
            f"{mode_help}\n"
            f"Файлы картинок (котики и мемы): {file_line}\n"
            "Для поддержки уместен котик или мем из списка. Если списка нет, image = null.\n\n"
            f"{_facts_text(db, user)}"
        )
        try:
            raw = _ask_gigachat(system_prompt, human_prompt)
            body, image_url = _parse_card(raw, fallback, allowed)
        except Exception as exc:
            print(f"[WISHES] evening GigaChat failed for user {user_id}: {exc}")
            body, image_url = _clip(fallback), None

        print(
            f"[WISHES] evening all_done={all_done} open={len(open_tasks)} "
            f"total={len(tasks)} user={user_id}"
        )
        return _save_notification(
            db,
            user_id=user.id,
            title=title,
            body=body,
            category="reminders",
            push_slot="evening",
            image_url=image_url,
        )
    finally:
        db.close()


def _already_sent_today(user_id: int, push_slot: str) -> bool:
    start, end = _local_day_utc_bounds()
    db = SessionLocal()
    try:
        found = (
            db.query(Notification.id)
            .filter(
                Notification.user_id == user_id,
                Notification.push_slot == push_slot,
                Notification.created_at >= start,
                Notification.created_at < end,
            )
            .first()
        )
        return found is not None
    finally:
        db.close()


def dispatch_magic_slot(push_slot: str) -> None:
    """Generate the given slot for every user who does not yet have one today."""
    global _dispatch_busy
    with _dispatch_lock:
        if _dispatch_busy:
            return
        _dispatch_busy = True
    try:
        db = SessionLocal()
        try:
            user_ids = [row[0] for row in db.query(User.id).all()]
        finally:
            db.close()
        generator = generate_morning_wish if push_slot == "morning" else generate_evening_wish
        for user_id in user_ids:
            if _already_sent_today(user_id, push_slot):
                continue
            try:
                generator(user_id)
            except Exception as exc:
                print(f"[WISHES] {push_slot} failed for user {user_id}: {exc}")
    finally:
        with _dispatch_lock:
            _dispatch_busy = False


def _due_slot(moment: datetime | None = None) -> str | None:
    local = moment.astimezone(NOVOSIBIRSK) if moment else _now_local()
    if local.hour == 8 and local.minute < 2:
        return "morning"
    if local.hour == 22 and 30 <= local.minute < 32:
        return "evening"
    return None


async def _scheduler_loop() -> None:
    print("[WISHES] scheduler started: 08:00 morning, 22:30 evening (Novosibirsk)")
    while True:
        try:
            slot = _due_slot()
            if slot:
                await asyncio.to_thread(dispatch_magic_slot, slot)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[WISHES] scheduler tick failed: {exc}")
        await asyncio.sleep(30)


def start_magic_scheduler() -> None:
    """Start the in-process cron loop. Safe to call once from the app lifespan."""
    global _scheduler_task
    if _scheduler_task is not None and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.get_running_loop().create_task(
        _scheduler_loop(),
        name="byte-magic-wishes",
    )


async def stop_magic_scheduler() -> None:
    global _scheduler_task
    task = _scheduler_task
    _scheduler_task = None
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
