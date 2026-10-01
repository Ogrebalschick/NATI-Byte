# BYTE — Архитектурная карта проекта

> **Для ИИ-агентов:** Прочти раздел [4. ИНСТРУКЦИЯ ДЛЯ ИИ-АГЕНТОВ](#4-инструкция-для-ии-агентов) **прежде** чем вносить любые изменения в код.

---

## Содержание

1. [Карта страниц и фронтенда](#1-карта-страниц-и-фронтенда)
2. [Структура базы данных](#2-структура-базы-данных)
3. [Карта API и эндпоинтов](#3-карта-api-и-эндпоинтов)
4. [Инструкция для ИИ-агентов](#4-инструкция-для-ии-агентов)

---

## 1. Карта страниц и фронтенда

### Технологический стек фронтенда

| Слой | Технология |
|------|-----------|
| Фреймворк | React Native + Expo SDK 57 |
| Роутинг | `expo-router` v4 (файловая маршрутизация) |
| Состояние | React Context (`AuthContext`) |
| Хранилище на устройстве | AsyncStorage |
| Иконки | `@expo/vector-icons` (Ionicons) |
| Локальные пуши | `expo-notifications` ~57.0.21 |
| Стилизация | StyleSheet (нативный RN) |
| ИИ-чат | GigaChat (через бэкенд) |

---

### 1.1 Дерево файловой структуры `frontend/src`

```
frontend/src/
│
├── app/                          # expo-router файловая маршрутизация
│   ├── _layout.tsx               # ← Корневой layout (AuthProvider + AppLockGate). Под SafeArea: SyncStatusBanner в потоке, затем стек index / (tabs) / auth
│   ├── index.tsx                 # ← Точка входа: <Redirect href="/(tabs)/chat" />
│   ├── auth.tsx                  # ← Алиас: re-export из screens/AuthScreen
│   └── (tabs)/
│       ├── _layout.tsx           # ← Bottom Tab Navigator (5 вкладок)
│       ├── statistics.tsx        # ← Вкладка «Статистика»
│       ├── todos.tsx             # ← Вкладка «Список дел»
│       ├── chat.tsx              # ← Вкладка «Чат» (Byte AI)
│       ├── notes.tsx             # ← Вкладка «Заметки»
│       └── profile/
│           ├── _layout.tsx       # ← Stack для профиля (index + auth + facts + sessions + notifications). Нижние табы остаются видимыми
│           ├── index.tsx         # ← Вкладка «Профиль»
│           ├── auth.tsx          # ← Экран авторизации внутри вкладки профиля
│           ├── facts.tsx         # ← Экран «Память ИИ»
│           ├── sessions.tsx      # ← Экран «Активные сессии»
│           └── notifications.tsx # ← История уведомлений. Колокольчик: navigate('/profile'), затем push('/profile/notifications')
│
├── screens/                      # Логика экранов (импортируются через app/)
│   ├── AuthScreen.tsx            # Авторизация / Регистрация
│   ├── byte.tsx                  # Чат с ИИ Byte (GigaChat)
│   ├── StatisticsScreen.tsx      # Статистика / Успеваемость
│   ├── NotesScreen.tsx           # Заметки
│   ├── TodoScreen.tsx            # Список дел (Task Manager)
│   ├── ProfileScreen.tsx         # Профиль пользователя
│   ├── FactsScreen.tsx           # Память ИИ (UserFacts)
│   ├── SessionsScreen.tsx        # Активные устройства / сессии
│   ├── NotificationsScreen.tsx   # История уведомлений: чипы, группировка по датам, картинка пожелания, кнопка «Сгенерировать ИИ-пуш»
│   ├── PinLockScreen.tsx         # PIN-экран блокировки
│   └── index.tsx                 # (barrel-экспорт экранов)
│
├── components/
│   ├── ScreenWrapper.tsx         # SafeAreaView-обёртка для всех экранов
│   ├── DevServerModal.tsx        # Dev-инструмент: смена URL бэкенда в рантайме
│   ├── SyncStatusBanner.tsx      # Плашка синхронизации в потоке layout: высота 0→40, крестик отменяет фон
│   ├── StatusIndicator.tsx       # Глобальный бейдж: «Офлайн режим» / «Гостевой режим» (встраивается в TopRightChrome)
│   ├── TopRightChrome.tsx        # Кластер правого верхнего угла: колокольчик + StatusIndicator
│   ├── NstuImportModal.tsx       # WebView-модал для импорта из ЛК НГТУ (ciu.nstu.ru)
│   ├── notifications/
│   │   └── NotificationBell.tsx  # Колокольчик + dropdown превью (3 последних, «Отметить всё», переход на историю)
│   ├── byte/
│   │   ├── input.tsx             # Поле ввода сообщения в чате
│   │   ├── messages.tsx          # Список сообщений чата
│   │   ├── history.tsx           # История диалогов
│   │   ├── helloByte.tsx         # Приветственный экран Byte
│   │   ├── error.tsx             # Состояние ошибки в чате
│   │   └── crisis.tsx            # Кризисная интервенция (особые ситуации)
│   ├── todos/
│   │   ├── CalendarView.tsx      # Три режима (День/Неделя/Месяц) с жестами свайпа и стрелками навигации. День: 28-дневная лента + 📅-пикер + свайп ±1 день. Неделя: навбар ◀ дата ▶ + свайп ±7 дней. Месяц: стрелки + свайп ±1 месяц, двойной тап по дню → режим «День». Почасовая сетка 00:00–23:00, авто-скролл 08:00, высота карточки = duration_minutes px.
    │   │   └── CreateTaskModal.tsx   # Создание И редактирование задач (editingTask prop): проект/раздел чипы + «Новый», DateTimePicker, поле duration_minutes с пресетами, P1–P4
│   ├── stats/
│   │   ├── CircularGpa.tsx       # Круговой индикатор GPA
│   │   ├── CircularPercent.tsx   # Круговой индикатор в %
│   │   ├── BarProgress.tsx       # Прогресс-бар для баллов по предметам
│   │   ├── GradeBadge.tsx        # Бейдж оценки (отлично / хорошо / ...)
│   │   ├── SubjectTrackerModals.tsx  # Модалы добавления/редактирования предметов
│   │   └── parseStats.ts         # Утилита разбора JSON успеваемости из ЛК
│   ├── facts/
│   │   └── FactSwipeDeck.tsx     # Swipe-карточки для просмотра/удаления фактов ИИ
│   ├── profile/
│   │   └── DayRhythmModal.tsx    # Тёмный шит «Режим дня»: время пробуждения и отхода ко сну
│   └── security/
│       ├── AppLockGate.tsx       # Ворота: при холодном старте показывает PIN-экран
│       ├── AppLockSettingsModal.tsx  # Настройки PIN-блокировки в профиле
│       └── PinPad.tsx            # Цифровая клавиатура для ввода PIN
│
├── context/
│   ├── AuthContext.tsx           # Глобальный контекст: auth, sync, сессия, 2FA, режим дня
│   └── NotificationsContext.tsx  # Лента уведомлений, unread-count, mark-read, планирование локальных пушей
│
├── api/
│   ├── config.ts                 # URL бэкенда, порт, hydrate из AsyncStorage. На Node SSR (`window` нет) чтение IP пропускается, дефолт — localhost
│   ├── http.ts                   # apiFetch — обёртка fetch с обработкой 401
│   ├── todosApi.ts               # CRUD запросы к /todos/*
│   ├── notesApi.ts               # CRUD запросы к /notes
│   ├── subjectsApi.ts            # CRUD запросы к /subjects
│   ├── sessionsApi.ts            # Запросы к /auth/sessions
│   ├── factsApi.ts               # Запросы к /profile/facts
│   └── notificationsApi.ts      # CRUD /notifications/*, POST /notifications/trigger-magic, image_url → абсолютный URL
│
├── storage/
│   ├── chatStorage.ts            # AsyncStorage: кэш чатов (per-user)
│   ├── notesStorage.ts           # AsyncStorage: черновики заметок
│   ├── todosStorage.ts           # AsyncStorage: оффлайн-кэш задач
│   ├── subjectsStorage.ts        # AsyncStorage: кэш предметов/баллов
│   ├── appLockStorage.ts         # AsyncStorage: PIN-код блокировки
│   ├── dayRhythmStorage.ts       # AsyncStorage: @guest_wake_time и @guest_sleep_time (ЧЧ:ММ)
│   └── notificationsStorage.ts   # AsyncStorage: гостевая лента уведомлений + map taskId → local push id
│
├── hooks/
│   └── useChatSync.ts            # Хук синхронизации истории чатов с сервером
│
├── notifications/
│   ├── localReminders.ts         # expo-notifications: пуш за 30 мин до due_date/schedule_date
│   └── dayRhythm.ts              # Гостевые ежедневные пуши по @guest_wake_time / @guest_sleep_time
│
├── types/
│   └── subjects.ts               # TypeScript-типы для предметов/баллов
│
├── navigation/
│   ├── AppNavigator.tsx          # (legacy, не используется expo-router)
│   └── BottomTabNavigator.tsx    # (legacy, не используется expo-router)
│
├── security/
│   └── biometricAuth.ts          # Биометрическая аутентификация (TouchID/FaceID)
│
├── deviceName.ts                 # Определяет имя устройства для сессии
└── api.ts                        # (legacy barrel, используй api/ директорию)
```

---

### 1.2 Маппинг экранов → файлы

| Экран | Route (expo-router) | Основной файл | Описание |
|-------|--------------------|--------------------|----------|
| **Стартовый редирект** | `/` | `app/index.tsx` | Немедленно редиректит на `/(tabs)/chat` |
| **Чат (Byte AI)** | `/(tabs)/chat` | `screens/byte.tsx` | Главный чат с ИИ. Использует GigaChat через `POST /ask`. Хранит историю локально + синхронизирует через `POST /auth/chats/save` |
| **Статистика** | `/(tabs)/statistics` | `screens/StatisticsScreen.tsx` | Отображает успеваемость из ЛК НГТУ (progress, control_weeks), GPA, ручные предметы и их баллы. Данные: `GET /sync/student-data` + `GET /subjects` |
| **Список дел** | `/(tabs)/todos` | `screens/TodoScreen.tsx` | Todoist-подобный таск-менеджер. Два режима: **Список** (проекты → разделы → задачи) и **Календарь** (Google Calendar-стиль, три вкладки с жестами навигации). В режиме «Список»: дашборд из 4 карточек-метрик (Всего / В работе / На сегодня / Выполнено) с интерактивной фильтрацией. Создание задачи: умный ввод проекта/раздела (строка = создать новый), два DateTimePicker для `due_date` и `schedule_date`, поле `duration_minutes` с пресетами. Данные: `GET /todos/data` |
| **Заметки** | `/(tabs)/notes` | `screens/NotesScreen.tsx` | Markdown-заметки с AI-категоризацией через GigaChat. Данные: `GET /notes` |
| **Профиль** | `/(tabs)/profile` | `screens/ProfileScreen.tsx` | Настройки аккаунта, 2FA, смена пароля, импорт из ЛК НГТУ, статус синхронизации. В разделе «БЕЗОПАСНОСТЬ И НАСТРОЙКИ» строка «Режим дня» открывает `DayRhythmModal`: два крупных блока «Время пробуждения» и «Время отхода ко сну». На iOS/Android тап открывает `@react-native-community/datetimepicker` (`mode="time"`, `display="spinner"`, `onValueChange` / `onDismiss`). «Сохранить» шлёт `PATCH /auth/profile/schedule` и обновляет `user.wake_time` / `user.sleep_time` в `AuthContext`. Гость видит ту же кнопку на стене профиля: часы пишутся в `@guest_wake_time` и `@guest_sleep_time`, локальные пуши ставятся на эти часы |
| **Авторизация** | `/(tabs)/profile/auth` или `/auth` | `screens/AuthScreen.tsx` | Регистрация (2 шага + код на почту) и вход (с опциональной 2FA). Интегрирован в ProfileScreen для гостевого режима |
| **Память ИИ** | `/(tabs)/profile/facts` | `screens/FactsScreen.tsx` | Просмотр и удаление фактов, которые ИИ запомнил о студенте. Данные: `GET /profile/facts` |
| **Активные сессии** | `/(tabs)/profile/sessions` | `screens/SessionsScreen.tsx` | Список всех залогиненных устройств, отзыв сессий. Данные: `GET /auth/sessions` |
| **Уведомления** | `/(tabs)/profile/notifications` | `screens/NotificationsScreen.tsx` | Экран внутри стека вкладки «Профиль», нижняя панель табов остаётся. Колокольчик с любой вкладки: `router.navigate('/profile')`, через 50 мс `router.push('/profile/notifications')`. «Назад» — `router.back()` на главный экран кабинета, экран выгружается из стека. Чипы [Все / Задачи / Напоминания / Пожелания], группировка по датам. Утро (`wishes`): ☀️ или ⛱️, если в тексте дождь. Перед сном (`push_slot=evening`): 🌙 или 🐱. Если есть `image_url`, под текстом квадратное фото. Кнопка «Сгенерировать ИИ-пуш ✨» вызывает `POST /notifications/trigger-magic`. Тап по карточке → `PATCH /notifications/{id}/read`. Гости видят ленту из AsyncStorage |
| **PIN-блокировка** | (модал поверх всего) | `screens/PinLockScreen.tsx` | Показывается `AppLockGate` при холодном старте если PIN установлен |

---

### 1.2.1 Дашборд метрик (`TodoScreen.tsx` — режим «Список»)

Блок из 4 карточек-метрик размещён между шапкой экрана и горизонтальными чипсами проектов. Пересчитывается через `useMemo` при смене проекта или обновлении данных.

#### Карточки и их вычисление

| Карточка | Ключ | Формула | Акцент |
|----------|------|---------|--------|
| Всего дел | `total` | `scopedTasks.length` | #8E8E93 (серый) |
| В работе | `in_progress` | `scopedTasks.filter(t => !t.is_completed).length` | #0A84FF (синий) |
| На сегодня | `today` | задачи, у которых `due_date` или `schedule_date` попадает в диапазон \[today 00:00 – today+1 00:00) | #FF9F0A (оранжевый) |
| Выполнено | `completed` | `scopedTasks.filter(t => t.is_completed).length` | #30D158 (зелёный) |

`scopedTasks` — плоский список задач текущего проекта (inbox или выбранный проект со всеми секциями).

#### Интерактивная фильтрация

- Тап по карточке → `metricFilter` = ключ карточки → список задач показывает плоский отфильтрованный `filteredScopedTasks`
- При создании/изменении задачи с `due_date` или `schedule_date` `TodoScreen` вызывает `rememberTask()` → локальный пуш за 30 минут (`expo-notifications`). Удаление и выполнение отменяют пуш через `forgetTask()`.
- Повторный тап по активной карточке → `metricFilter = null` → обычная структура с секциями
- Смена проекта → автоматический сброс через `useEffect(() => setMetricFilter(null), [selectedProjectId])`
- Индикаторная строка под чипсами показывает активный фильтр + кнопку × для сброса

---

### 1.2.2 Логика календаря (`CalendarView.tsx`)

#### Три режима и навигация

| Режим | Переключение назад | Переключение вперёд | Доп. жесты |
|-------|-------------------|---------------------|------------|
| **День** | Свайп вправо / тап ◀ в DayStrip | Свайп влево / тап ▶ в DayStrip | 📅-иконка слева от ленты → DateTimePicker (прыжок на любую дату) |
| **Неделя** | Свайп вправо / кнопка ◀ | Свайп влево / кнопка ▶ | Тап по числу в шапке → переключает в режим «День» для этого дня |
| **Месяц** | Свайп вправо / кнопка ◀ | Свайп влево / кнопка ▶ | 1-й тап по дню = подсветка + список задач внизу; 2-й тап по тому же дню = режим «День» |

#### Компонент `SwipeableView`

Обёртка на основе `PanResponder`, захватывает только горизонтально-доминирующие жесты:
- `onMoveShouldSetPanResponder`: срабатывает когда `|dx| > 15` **и** `|dx| > |dy| × 1.8`
- `SWIPE_MIN_DIST = 40 px` **или** `SWIPE_MIN_VX = 0.4 px/ms` — альтернативные пороги срабатывания
- Вертикальная прокрутка внутренних `ScrollView` не затрагивается

#### Пикер дат (иконка 📅 в ленте DayStrip)

| Платформа | Поведение |
|-----------|-----------|
| Android | `<DateTimePicker display="default" />` — нативный диалог, закрывается автоматически |
| iOS | `<Modal animationType="slide">` с `<DateTimePicker display="inline" />` + кнопка «Готово» |

#### Почасовая сетка (DayView и WeekView)

| Константа | Значение | Назначение |
|-----------|----------|------------|
| `HOUR_HEIGHT` | 60 px | 1 час = 60 px → 1 минута = 1 px |
| `PX_PER_MIN` | 1 px | `HOUR_HEIGHT / 60` |
| `START_HOUR` | 0 | Сетка начинается с 00:00 |
| `END_HOUR` | 23 | Сетка заканчивается в 23:00 |
| `AUTO_SCROLL_HOUR` | 8 | При открытии авто-скролл к 08:00 |
| `GRID_BUFFER` | 120 px | Запас снизу — задача у 23:00 не обрезается |
| `SWIPE_MIN_DIST` | 40 px | Минимальная дистанция свайпа |
| `SWIPE_MIN_VX` | 0.4 px/ms | Минимальная скорость свайпа |

`timeToY(date)` = `(hour - START_HOUR) × 60 + minutes` px от верха сетки.  
`durationToH(rawMinutes)` = `max(20, Number(rawMinutes) × 1)` px высоты карточки.

#### Адаптивные карточки (`DayEventCard`)

| Высота слота | Тип | Контент |
|-------------|-----|---------|
| < 45 px | **micro** | Иконка + время + название в одну строку |
| 45–75 px | **compact** | Badge со временем + название |
| ≥ 75 px | **full** | Badge + время (справа) + название + проект |

---

### 1.2.3 Локальные напоминания (`expo-notifications`)

В корневом `_layout.tsx` вызывается `Notifications.setNotificationHandler`, чтобы баннер показывался и при открытом приложении (`shouldShowBanner` + `shouldShowList`, SDK 57). **Expo Go (SDK 53+):** модуль `expo-notifications` на Android бросает исключение уже при `import`. Обработчик и `scheduleNotificationAsync` регистрируются только если `Constants.executionEnvironment !== StoreClient` (dev/prod native build). В песочнице пуши — no-op.

Планирование — `src/notifications/localReminders.ts`:

| Событие | Действие |
|---------|----------|
| Создание задачи с `due_date` / `schedule_date` | Берётся более раннее из двух времён, `fireAt = target − 30 мин`. Если `fireAt` в будущем — `scheduleNotificationAsync` с `DATE`-триггером, identifier `byte-task-{id}` |
| Изменение задачи | Старый пуш отменяется, при необходимости ставится новый |
| Удаление / выполнение | `cancelScheduledNotificationAsync` |
| Нет прав / web / время уже прошло | no-op |

Android-канал `byte-reminders` создаётся перед запросом permissions (нужен для Android 13+). Identifier и map `taskId → notificationId` хранятся в AsyncStorage (`@byte_task_reminder_ids`).

Гостевой режим дня — `src/notifications/dayRhythm.ts`. После сохранения «Режима дня» без аккаунта часы из `@guest_wake_time` и `@guest_sleep_time` ставят ежедневные локальные пуши (`DAILY`, identifiers `byte-rhythm-wake` и `byte-rhythm-sleep`, канал `byte-rhythm`). В Expo Go и на web планирование — no-op, часы всё равно остаются в AsyncStorage. У авторизованного пользователя утро и вечер шлёт серверный планировщик; сохранение расписания снимает гостевые локальные пуши, чтобы не дублировать их.

---

### 1.3 Глобальные компоненты и контексты

#### `src/context/AuthContext.tsx` — Центральный контекст приложения

Оборачивает всё дерево в `<AuthProvider>`. Предоставляет:

| Поле / метод | Тип | Назначение |
|---|---|---|
| `user` | `User \| null` | Текущий залогиненный пользователь |
| `token` | `string \| null` | JWT Bearer token |
| `isLoading` | `boolean` | Инициализация завершена |
| `isAuthenticated` | `boolean` | `!!user` |
| `syncStatus` | `SyncStatus` | Статус синхронизации с НГТУ: `idle \| syncing \| error_auth \| success` |
| `showReviewBanner` | `boolean` | Нужно ли обновить факты (раз в 180 дней) |
| `login()` | `async` | Вход по email+password; бросает `{type:'requires_verification'}` при 2FA |
| `verifyLogin()` | `async` | Подтверждение 2FA-кода |
| `requestRegisterCode()` | `async` | Шаг 1 регистрации |
| `verifyRegister()` | `async` | Шаг 2 регистрации |
| `logout()` | `async` | Выход, очистка AsyncStorage |
| `deleteAccount()` | `async` | Удаление аккаунта |
| `toggle2FA()` | `async` | Вкл/выкл 2FA |
| `updateDayRhythm(wake, sleep)` | `async` | `PATCH /auth/profile/schedule` со строками `ЧЧ:ММ`, запись `wake_time` / `sleep_time` в `user` и `@auth_user` |
| `requestPasswordReset()` | `async` | Отправить код смены пароля |
| `confirmPasswordReset()` | `async` | Подтвердить смену пароля |
| `nstuLogin()` | `async` | Вход через НГТУ ID (без пароля BYTE) |
| `setPassword()` | `async` | Установить BYTE-пароль для НГТУ-аккаунтов |
| `parseCabinet()` | `async` | Отправить текст страницы ЛК на парсинг |
| `getStudentData()` | `async` | Получить сохранённые снапшоты ЛК |
| `markLastSync()` | `async` | Зафиксировать время последней синхронизации |
| `dismissSyncStatus()` | `sync` | Сбросить статус баннера синхронизации (`success` / `error_auth` → `idle`) |
| `cancelSync()` | `sync` | Отмена фонового синка: `syncStatus = idle`, `stopLoading()` у скрытого WebView и его размонтирование |
| `confirmProfileReview()` | `async` | Отметить, что студент обновил факты профиля |

---

#### `src/context/NotificationsContext.tsx` — Лента уведомлений

Оборачивает дерево внутри `AuthProvider`. Предоставляет:

| Поле / метод | Назначение |
|---|---|
| `items` | Полный список уведомлений (сервер или гостевой AsyncStorage) |
| `unreadCount` | Число непрочитанных для бейджа колокольчика (`GET /notifications/unread-count`) |
| `latest` | 3 самых новых — для dropdown |
| `refresh()` | Перезагрузка ленты (на старте, при фокусе приложения, раз в 60 с) |
| `markRead(id)` | `PATCH /notifications/{id}/read` или локальная отметка |
| `markAllRead()` | `POST /notifications/read-all` |
| `prependNotification(item)` | Вставляет новую карточку в начало ленты без полной перезагрузки (после `trigger-magic`) |
| `rememberTask(task)` | Планирует OS-пуш за 30 мин + пишет карточку в ленту (на создании) |
| `forgetTask(taskId)` | `cancelScheduledNotificationAsync` |

Гостевой режим: лента и счётчик живут в `notificationsStorage.ts` (`@byte_notifications_guest`).

---

#### Общие компоненты (`src/components/`)

| Компонент | Назначение |
|-----------|-----------|
| `ScreenWrapper` | SafeAreaView-обёртка с `paddingHorizontal: 16`, тёмный фон `#17161B`. Используется на каждом экране |
| `SyncStatusBanner` | Блок в потоке корневого `_layout.tsx` сразу под SafeArea, без `position: 'absolute'`. Высота анимируется `0 → 40`. В режиме `syncing` справа крестик: `cancelSync()` ставит `syncStatus` в `idle` и останавливает скрытый WebView (`stopLoading`, затем размонтирование). `success` и `error_auth` сами схлопываются. Пока плашка раскрыта, экраны табов сдвигаются вниз |
| `NstuImportModal` | WebView-модал, открывающий `ciu.nstu.ru`. После логина автоматически обходит страницы ЛК (AUTO_SYNC_STEPS), извлекает текст и отправляет на `POST /sync/parse-cabinet`. Фоновый `auto-sync` живёт вне модала, за экраном; `cancelSync()` вызывает `stopLoading()` и размонтирует его |
| `DevServerModal` | Dev-инструмент (вызывается долгим тапом по вкладке «Чат»): позволяет сменить IP-адрес бэкенда без пересборки |
| `StatusIndicator` | Бейдж «Офлайн режим» / «Гостевой режим». Проп `embedded` — без absolute-позиции, встраивается в `TopRightChrome`. При online + авторизован — `return null` |
| `TopRightChrome` | Абсолютный кластер `right: 14, zIndex: 9999`: колокольчик слева, `StatusIndicator` справа. Рендерится в `_layout.tsx` |
| `NotificationBell` | Иконка колокольчика. Красный бейдж с числом непрочитанных. Тап открывает компактный dropdown: 3 последних уведомления, «Отметить всё», «Посмотреть все уведомления» → `navigate('/profile')` и следом `push('/profile/notifications')` |
| `AppLockGate` | При холодном старте: читает PIN из AsyncStorage, если есть — показывает `PinLockScreen` поверх всего контента |
| `AppLockSettingsModal` | Настройка PIN в разделе «Профиль» |
| `DayRhythmModal` | Тёмный нижний шит из «Режима дня»: крупные контрастные часы пробуждения и сна, нативное колесо времени, подпись про биоритмы, кнопка «Сохранить» |
| `PinPad` | Цифровая клавиатура 3×4 для ввода PIN |

---

#### Статистика (`src/components/stats/`)

| Компонент | Назначение |
|-----------|-----------|
| `CircularGpa` | SVG-кольцо со значением GPA (от 2 до 5) |
| `CircularPercent` | SVG-кольцо с процентом (0–100) |
| `BarProgress` | Горизонтальный прогресс-бар: `current_score / max_score` для ручных предметов |
| `GradeBadge` | Цветной бейдж текстовой оценки: «отлично» → зелёный, «неудовл» → красный и т.д. |
| `SubjectTrackerModals` | Модал создания/редактирования ручного предмета и добавления балла |
| `parseStats.ts` | Утилита: разбирает `StudentData.payload` для экрана статистики (subjects, GPA, контрольные недели) |

---

#### Чат (`src/components/byte/`)

| Компонент | Назначение |
|-----------|-----------|
| `messages.tsx` | FlatList рендер сообщений чата (user / assistant / system) |
| `input.tsx` | TextInput + кнопка отправки, поддержка multiline |
| `history.tsx` | Боковая панель с историей диалогов |
| `helloByte.tsx` | Стартовый экран с подсказками для нового чата |
| `error.tsx` | Отображение ошибки при сбое API |
| `crisis.tsx` | Специальный блок кризисной поддержки (показывается при тревожных запросах) |

---

## 2. Структура базы данных

**Движок:** SQLite (файл `backend/byte.db`)
**ORM:** SQLAlchemy (декларативный стиль)
**URL:** `sqlite:///./byte.db` (из переменной окружения `DATABASE_URL`)

Миграции: лёгкие — функция `_run_migrations()` в `backend/database.py` добавляет недостающие столбцы через `ALTER TABLE`, не удаляя существующие данные.

---

### Диаграмма связей (ERD)

```
users (1) ──── (N) chats
users (1) ──── (N) student_data
users (1) ──── (N) custom_subjects ──── (N) score_logs
users (1) ──── (N) notes
users (1) ──── (N) user_facts
users (1) ──── (N) user_sessions
users (1) ──── (N) projects ──── (N) sections ──── (N) tasks
users (1) ──── (N) tasks  [прямая связь, tasks.user_id]
users (1) ──── (N) notifications
```

---

### Таблица `users`

Основная таблица аккаунтов.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `email` | String | UNIQUE, index | Только `@stud.nstu.ru` при обычной регистрации |
| `password_hash` | String | — | bcrypt-хэш. Пустой для НГТУ ID аккаунтов |
| `name` | String | — | Короткое имя (из формы регистрации) |
| `created_at` | DateTime | default=now | Дата создания |
| `is_2fa_enabled` | Boolean | default=False | Включена ли двухфакторная авторизация |
| `full_name` | String | nullable | ФИО из ЛК НГТУ (парсится автоматически) |
| `student_group` | String | nullable | Группа из ЛК НГТУ (пр.: «АВТ-31») |
| `is_synced_with_nstu` | Boolean | default=False | True после первой успешной синхронизации |
| `wake_time` | String | NOT NULL, default=`"08:00"` | Время пробуждения, Новосибирск, формат `ЧЧ:ММ`. Утренний пуш (`push_slot=morning`) |
| `sleep_time` | String | NOT NULL, default=`"22:30"` | Время отхода ко сну, Новосибирск, формат `ЧЧ:ММ`. Вечерний пуш (`push_slot=evening`) |

**Связи (cascade=all, delete-orphan):**
- `chats` → `Chat`
- `student_data` → `StudentData`
- `custom_subjects` → `CustomSubject`
- `notes` → `Note`
- `facts` → `UserFact`
- `sessions` → `UserSession`
- `projects` → `Project`
- `tasks` → `Task`
- `notifications` → `Notification`

---

### Таблица `chats`

История диалогов пользователя с Byte AI.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | String | PK, index | UUID, генерируется на клиенте |
| `user_id` | Integer | FK → users.id | Владелец |
| `title` | String | — | Заголовок диалога (первое сообщение пользователя) |
| `messages` | JSON | default=[] | Список `{role, content}` объектов |
| `created_at` | DateTime | default=now | Дата создания |
| `updated_at` | DateTime | default=now, onupdate=now | Дата последнего изменения |

**Связи:** `user` → `User`

---

### Таблица `student_data`

JSON-снапшоты страниц личного кабинета НГТУ (ciu.nstu.ru), обработанные GigaChat.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `user_id` | Integer | FK → users.id, index | Владелец |
| `data_type` | String | index | Тип страницы: `profile \| timetable \| progress \| task \| kp_rgz_praktiki \| academic_backlog \| individual_progress \| timetable_consult \| timetable_session` |
| `payload` | JSON | default=dict | Структурированные данные (различаются по `data_type`) |
| `updated_at` | DateTime | default=now, onupdate=now | Дата последнего обновления снапшота |

**Особенности:** Строка upsert-ится по паре `(user_id, data_type)` — одна строка на тип данных на пользователя.

**Связи:** `user` → `User`

---

### Таблица `custom_subjects`

Ручные предметы, созданные студентом для отслеживания накопительного балла.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `user_id` | Integer | FK → users.id, NOT NULL, index | Владелец |
| `name` | String | NOT NULL | Название предмета |
| `max_score` | Float | NOT NULL | Максимум баллов за семестр |
| `target_score` | Float | NOT NULL | Желаемый балл студента |
| `is_custom` | Boolean | default=True, NOT NULL | Всегда True (зарезервировано для будущих автоимпортированных) |

**Связи:**
- `user` → `User`
- `scores` → `ScoreLog` (cascade=all, delete-orphan)

---

### Таблица `score_logs`

Единичная запись балла, привязанная к предмету.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `subject_id` | Integer | FK → custom_subjects.id, NOT NULL, index | Предмет |
| `score` | Float | NOT NULL | Количество баллов (может быть отрицательным — штраф) |
| `description` | String | nullable | Комментарий (пр.: «КН-1», «Лабораторная №3») |
| `created_at` | DateTime | NOT NULL, default=now | Дата записи (можно указать вручную при импорте) |

**Связи:** `subject` → `CustomSubject`

---

### Таблица `notes`

Markdown-заметки студента с AI-категоризацией.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `user_id` | Integer | FK → users.id, NOT NULL, index | Владелец |
| `title` | String | NOT NULL, default="" | Заголовок заметки |
| `content` | Text | NOT NULL, default="" | Тело заметки (Markdown) |
| `category` | String | NOT NULL, default="Разное" | Категория (одно слово или несколько через запятую). При `ai_classify=true` дополняется словом от GigaChat |
| `created_at` | DateTime | NOT NULL, default=now | Дата создания (можно задать при импорте) |
| `updated_at` | DateTime | NOT NULL, default=now | Дата последнего редактирования |

**Связи:** `user` → `User`

---

### Таблица `user_facts`

Память ИИ о студенте. Факты извлекаются из чата, заметок, оценок и профиля ЛК.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `user_id` | Integer | FK → users.id (ondelete=CASCADE), NOT NULL, index | Владелец |
| `fact_text` | String | NOT NULL | Текст факта (макс. 400 символов) |
| `source` | String | NOT NULL, index | Источник: `cabinet \| chat \| notes \| grades` |
| `created_at` | DateTime | NOT NULL, default=now | Дата создания |

**Дедупликация:** При записи новых фактов сервер проверяет токен-сходство (стемминг) со всеми существующими фактами — дубликаты и парафразы отбрасываются.

**Связи:** `user` → `User`

---

### Таблица `user_sessions`

Одна залогиненная сессия (устройство). Удаление строки инвалидирует JWT.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | String | PK, index | UUID, генерируется при каждом входе |
| `user_id` | Integer | FK → users.id (ondelete=CASCADE), NOT NULL, index | Владелец |
| `device_name` | String | NOT NULL, default="Неизвестное устройство" | Имя устройства из User-Agent или явно переданное |
| `ip_address` | String | nullable | IP-адрес клиента (X-Forwarded-For или request.client) |
| `last_active` | DateTime | NOT NULL, default=now | Обновляется при каждом запросе (debounce 60 сек) |

**Связи:** `user` → `User`

---

### Таблица `projects`

Верхнеуровневый контейнер задач (аналог проекта в Todoist).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `user_id` | Integer | FK → users.id (ondelete=CASCADE), NOT NULL, index | Владелец |
| `name` | String | NOT NULL | Название проекта (пр.: «Учёба», «Личное») |
| `color` | String | NOT NULL, default="#6366f1" | HEX-цвет проекта |
| `created_at` | DateTime | NOT NULL, default=now | Дата создания |

**Связи:**
- `user` → `User`
- `sections` → `Section` (cascade=all, delete-orphan, order_by=position)
- `tasks` → `Task` (cascade=all, delete-orphan)

---

### Таблица `sections`

Именованная группа задач внутри проекта (аналог секции в Todoist).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `project_id` | Integer | FK → projects.id (ondelete=CASCADE), NOT NULL, index | Проект-владелец |
| `name` | String | NOT NULL | Название секции (пр.: «1 семестр», «Лабораторные») |
| `position` | Integer | NOT NULL, default=0 | Порядок отображения |

**Связи:**
- `project` → `Project`
- `tasks` → `Task` (cascade=all, delete-orphan)

---

### Таблица `tasks`

Единичная задача. Может быть в проекте и/или секции, или в «Входящих» (без проекта).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `user_id` | Integer | FK → users.id (ondelete=CASCADE), NOT NULL, index | Владелец |
| `project_id` | Integer | FK → projects.id (ondelete=CASCADE), nullable | Проект (null = Входящие) |
| `section_id` | Integer | FK → sections.id (ondelete=CASCADE), nullable | Секция (null = без секции) |
| `title` | String | NOT NULL | Заголовок задачи |
| `description` | Text | nullable, default="" | Подробное описание |
| `due_date` | DateTime | nullable | **Дедлайн** — крайний срок сдачи/выполнения задачи |
| `schedule_date` | DateTime | nullable | **Дата выполнения** — когда студент планирует работать над задачей (может не совпадать с дедлайном) |
| `duration_minutes` | Integer | nullable, default=30 | **Длительность** работы над задачей в минутах. Используется CalendarView для масштабирования карточки по высоте на почасовой сетке. Диапазон: 1–1440 (целые сутки). |
| `priority` | Integer | NOT NULL, default=4 | Приоритет: 1 (наивысший) … 4 (нет приоритета) |
| `is_completed` | Boolean | NOT NULL, default=False | Выполнена ли |
| `created_at` | DateTime | NOT NULL, default=now | Дата создания |
| `updated_at` | DateTime | NOT NULL, default=now | Дата последнего изменения |

**Связи:**
- `user` → `User`
- `project` → `Project`
- `section` → `Section`

---

### Таблица `notifications`

Уведомления в ленте пользователя. Создаются бэкенд-сервисами (планировщик дедлайнов, ежедневные пожелания), читаются мобильным клиентом.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | Integer | PK, index | Автоинкремент |
| `user_id` | Integer | FK → users.id (ondelete=CASCADE), NOT NULL, index | Владелец |
| `title` | String | NOT NULL, max 200 | Заголовок уведомления (пр.: «Дедлайн по физике!») |
| `body` | Text | NOT NULL, default="" | Тело уведомления (пр.: «Через 30 минут истекает срок сдачи РГЗ») |
| `category` | String | NOT NULL, default="tasks", index | Категория: `tasks` \| `reminders` \| `wishes` |
| `image_url` | String | nullable | Относительный URL картинки, например `/static/memes/cat.png`. Файл лежит в `backend/static/memes/`. Пусто, если карточка без мема |
| `push_slot` | String | nullable, index | Слот автоматического пуша: `morning` (в `users.wake_time`) \| `evening` (в `users.sleep_time`). `NULL` у остальных карточек |
| `is_read` | Boolean | NOT NULL, default=False | Прочитано ли пользователем |
| `created_at` | DateTime | NOT NULL, default=now, index | Дата создания (используется для сортировки: новейшие первые). Хранится как naive UTC |

**Категории:**

| Значение | Описание |
|----------|----------|
| `tasks` | Напоминания о дедлайнах и просроченных задачах |
| `reminders` | Вечерняя поддержка перед сном (слот `evening`) и прочие напоминания учёбы |
| `wishes` | Утренние пожелания (слот `morning`): милое пожелание, предсказание или шуточный праздник |

Картинки для `image_url` кладутся в `backend/static/memes/` (котики, `meme_2`, `meme_3`, `meme_5` и любые другие png/jpg/webp/gif). Сервер отдаёт каталог как `GET /static/memes/<файл>`. Имя файла в БД не хранится отдельно: в колонке лежит путь вида `/static/memes/meme_2.png`. Клиент склеивает его с origin бэкенда.

**Связи:** `user` → `User` (cascade=all, delete-orphan — удаляются вместе с пользователем)

---

## 3. Карта API и эндпоинтов

**Бэкенд:** FastAPI (Python), порт `8000`
**Аутентификация:** JWT Bearer Token (срок 7 дней)
**CORS:** `allow_origins=["*"]` (на время разработки)
**Pydantic-схемы:** все в `backend/models.py`

---

### 3.0 Корневые эндпоинты (`main.py`)

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `GET` | `/` | — | `{message: str}` | Health-check |
| `POST` | `/ask` | `AskRequest` | `{answer: str}` | Чат с GigaChat-2-Pro. Принимает массив `messages: [{role, content}]`, возвращает ответ модели. Используется экраном Byte |

**Схема `AskRequest`:**
```python
class AskRequest(BaseModel):
    messages: List[Message]  # [{role: "user"|"assistant"|"system", content: str}]
```

---

### 3.1 Auth (`/auth`) — `backend/auth.py`

Все запросы без JWT (кроме помеченных 🔒).

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `POST` | `/auth/register/init` | `RegisterInit` | `{status, message}` | Шаг 1 регистрации. Проверяет домен `@stud.nstu.ru`, отправляет 6-значный код на email |
| `POST` | `/auth/register/verify` | `VerifyRegister` | `{access_token, token_type, user}` | Шаг 2 регистрации. Проверяет код → создаёт `User` → возвращает JWT |
| `POST` | `/auth/login` | `UserLogin` | `{access_token, ...}` или `{status: "requires_verification"}` | Вход по email+password. При 2FA возвращает статус вместо токена |
| `POST` | `/auth/login/verify` | `VerifyLogin` | `{access_token, token_type, user}` | 2FA: подтверждение кода после `/auth/login` |
| `POST` | `/auth/nstu-login` | `NstuLoginRequest` | `{access_token, token_type, has_password, created, user}` | Вход/регистрация через НГТУ ID (email из ЛК). Новые аккаунты создаются без BYTE-пароля |
| `GET` 🔒 | `/auth/me` | — | `UserResponse + {created_at}` | Данные текущего пользователя, включая `wake_time` и `sleep_time` |
| `PATCH` 🔒 | `/auth/profile/schedule` | `UserUpdate` | `{status, wake_time, sleep_time}` | Сохранить биоритм. Поля `ЧЧ:ММ`. В теле можно передать только одно из них — второе не затирается |
| `DELETE` 🔒 | `/auth/delete` | — | `{status, message}` | Необратимое удаление аккаунта и всех связанных данных |
| `PATCH` 🔒 | `/auth/2fa` | `Set2FARequest` | `{status, is_2fa_enabled, message}` | Включить/выключить двухфакторную аутентификацию |
| `POST` 🔒 | `/auth/password-reset/request` | — | `{status, message}` | Отправить код смены пароля на email пользователя |
| `POST` 🔒 | `/auth/password-reset/confirm` | `PasswordResetConfirm` | `{status, has_password, message}` | Подтвердить смену пароля кодом + новый пароль |
| `POST` 🔒 | `/auth/set-password` | `SetPasswordRequest` | `{status, has_password, message}` | Установить BYTE-пароль для аккаунтов без пароля (НГТУ ID) |
| `POST` 🔒 | `/auth/chats/save` | `ChatSave` | `{success: true}` | Upsert диалога по UUID. Синхронизирует историю чатов с сервером |
| `GET` 🔒 | `/auth/chats` | — | `List[ChatHistory]` | Все диалоги пользователя (id, title, messages, created_at, updated_at) |
| `GET` 🔒 | `/auth/sessions` | — | `List[UserSessionResponse]` | Список активных сессий. Текущая помечена `is_current: true` |
| `DELETE` 🔒 | `/auth/sessions/other` | — | `{status, revoked: int}` | Завершить все сессии кроме текущей |
| `DELETE` 🔒 | `/auth/sessions/{session_id}` | — | `{status: "deleted"}` | Завершить одну конкретную сессию по UUID |

**Ключевые схемы:**

```python
class RegisterInit(BaseModel):
    email: EmailStr      # должен быть @stud.nstu.ru
    password: str
    name: str

class VerifyRegister(BaseModel):
    email: EmailStr
    code: str
    device_name: Optional[str]   # макс. 120 символов

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_name: Optional[str]

class NstuLoginRequest(BaseModel):
    email: EmailStr
    device_name: Optional[str]

class Set2FARequest(BaseModel):
    enabled: bool

class PasswordResetConfirm(BaseModel):
    code: str
    new_password: str   # минимум 6 символов

class SetPasswordRequest(BaseModel):
    new_password: str   # минимум 6 символов

class UserResponse(BaseModel):
    # ...id, email, name, created_at, is_2fa_enabled
    wake_time: Optional[str] = "08:00"    # ЧЧ:ММ, Новосибирск
    sleep_time: Optional[str] = "22:30"

class UserUpdate(BaseModel):
    wake_time: Optional[str] = "08:00"    # валидатор ЧЧ:ММ; None в теле сбрасывает к дефолту
    sleep_time: Optional[str] = "22:30"

class UserSessionResponse(BaseModel):
    id: str
    device_name: str
    ip_address: Optional[str]
    last_active: datetime
    is_current: bool
```

---

### 3.2 Sync / Parser (`/sync`) — `backend/parser.py`

Парсинг страниц личного кабинета НГТУ через GigaChat.

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `POST` 🔒 | `/sync/parse-cabinet` | `CabinetParseRequest` | `{status, page_type, payload, is_synced_with_nstu, full_name, student_group}` | Принимает сырой текст страницы ЛК, передаёт GigaChat-2-Pro для структурирования, сохраняет в `student_data`. При `page_type=profile` обновляет `User.full_name` и `User.student_group` |
| `GET` 🔒 | `/sync/student-data` | `?types=profile,timetable,...` | `{items: {data_type: {payload, updated_at}}}` | Возвращает сохранённые снапшоты ЛК. Опциональная фильтрация по `types` (через запятую) |

**Схема `CabinetParseRequest`:**
```python
class CabinetParseRequest(BaseModel):
    page_type: str   # profile | timetable | progress | task | kp_rgz_praktiki |
                     # academic_backlog | individual_progress | timetable_consult | timetable_session
    raw_text: str    # Сырой текст страницы (макс. 20 000 символов, обрезается)
```

**Промпты GigaChat по `page_type`:**

| `page_type` | Что возвращает GigaChat |
|-------------|------------------------|
| `profile` | `{full_name, student_group, faculty, course, record_book, specialty}` |
| `timetable` | `{days: [{day, date, lessons: [{time, subject, type, room, teacher, week}]}]}` |
| `progress` | `{semester, control_week, subjects: [{name, control_type, grade, points, teacher, attestation}]}` |
| `task` / `kp_rgz_praktiki` | `{tasks: [{subject, title, task_type, deadline, status, teacher, comment}]}` |
| `academic_backlog` | `{backlogs: [{subject, teacher, control_type, status, deadline, semester}]}` |
| `individual_progress` | `{achievements: [{title, category, date, level, result, document}]}` |
| `timetable_session` | `{exams: [{subject, date, time, room, teacher, control_type}]}` |
| `timetable_consult` | `{consultations: [{subject, date, time, room, teacher}]}` |

---

### 3.3 Subjects / Grades (`/subjects`) — `backend/subjects.py`

Ручное отслеживание накопительных баллов по предметам.

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `POST` 🔒 | `/subjects` | `CustomSubjectCreate` | `dict` (subject+scores) | Создать новый предмет |
| `GET` 🔒 | `/subjects` | — | `{items: [subject+scores]}` | Список всех предметов пользователя с накопленными баллами |
| `POST` 🔒 | `/subjects/{subject_id}/scores` | `ScoreLogCreate` | `dict` (score) | Добавить запись балла к предмету |
| `DELETE` 🔒 | `/subjects/{subject_id}/scores/{score_id}` | — | `{status, id}` | Удалить запись балла |

**Схемы:**
```python
class CustomSubjectCreate(BaseModel):
    name: str
    max_score: float      # > 0
    target_score: float   # >= 0
    is_custom: bool = True

class ScoreLogCreate(BaseModel):
    score: float              # != 0
    description: Optional[str]
    created_at: Optional[datetime]  # Если не указан — datetime.utcnow()
```

---

### 3.4 Notes (`/notes`) — `backend/notes.py`

Markdown-заметки с опциональной AI-категоризацией.

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `GET` 🔒 | `/notes` | — | `{items: [NoteResponse]}` | Все заметки пользователя (сортировка по убыванию `created_at`) |
| `POST` 🔒 | `/notes` | `NoteCreate` | `dict` (note) | Создать заметку. При `ai_classify=true` категория определяется GigaChat-2-Pro |
| `PUT` 🔒 | `/notes/{note_id}` | `NoteUpdate` | `dict` (note) | Обновить заметку. При `ai_classify=true` категория пересчитывается |
| `DELETE` 🔒 | `/notes/{note_id}` | — | `{status, id}` | Удалить заметку |

**Схемы:**
```python
class NoteCreate(BaseModel):
    title: str = ""
    content: str = ""
    category: Optional[str] = None     # Ручная категория
    ai_classify: bool = False           # Если True — GigaChat определяет категорию
    created_at: Optional[datetime]      # Для импорта с конкретной датой

class NoteUpdate(BaseModel):
    title: Optional[str]
    content: Optional[str]
    category: Optional[str]
    ai_classify: bool = False
```

---

### 3.5 Facts / AI Memory (`/profile`) — `backend/facts.py`

Факты об ИИ-памяти студента. Читать и удалять может только сам студент.

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `GET` 🔒 | `/profile/facts` | — | `UserFactsGroupedResponse` | Все факты, сгруппированные по источнику: `{cabinet, chat, notes, grades}` |
| `POST` 🔒 | `/profile/facts` | `UserFactsCreate` | `{created: [UserFactResponse]}` | Записать список фактов. Дубликаты и парафразы автоматически отфильтровываются |
| `PUT` 🔒 | `/profile/facts/{fact_id}` | `UserFactUpdate` | `dict` (fact) | Изменить текст одного факта |
| `DELETE` 🔒 | `/profile/facts/all` | — | `{status, deleted: int}` | Полная очистка памяти ИИ о пользователе |
| `DELETE` 🔒 | `/profile/facts/{fact_id}` | — | `{status, id}` | Удалить один факт |

**Схемы:**
```python
class UserFactsCreate(BaseModel):
    facts: List[str]        # Макс. 12 фактов за один запрос, каждый ≤ 400 символов
    source: str = "chat"    # cabinet | chat | notes | grades

class UserFactUpdate(BaseModel):
    fact_text: str   # Не пустой, ≤ 400 символов

class UserFactsGroupedResponse(BaseModel):
    groups: Dict[str, List[UserFactResponse]]
    # Ключи: "cabinet", "chat", "notes", "grades" (и любой другой source)
```

---

### 3.6 Todos (`/todos`) — `backend/todos.py`

Todoist-подобный таск-менеджер: Проекты → Секции → Задачи.

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `GET` 🔒 | `/todos/data` | — | `TodosDataResponse` | Полное дерево данных. **Первым элементом** массива `projects` всегда является виртуальный проект `{id: "all_tasks", name: "Все задачи"}`, агрегирующий все активные задачи пользователя. Далее — реальные проекты пользователя |
| `POST` 🔒 | `/todos/projects` | `ProjectCreate` | `ProjectResponse` | Создать проект |
| `POST` 🔒 | `/todos/sections` | `SectionCreate` | `SectionResponse` | Создать секцию внутри проекта (проект должен принадлежать текущему пользователю) |
| `PUT` 🔒 | `/todos/sections/{section_id}` | `SectionUpdate` | `SectionResponse` | Переименовать раздел (`name`) или слить его с другим (`merge_into_section_id`). При слиянии все задачи перемещаются в целевой раздел bulk UPDATE, исходный удаляется. Возвращается итоговое состояние целевого раздела |
| `POST` 🔒 | `/todos/tasks` | `TaskCreate` | `TaskResponse` | Создать задачу. `project_id`/`section_id` принимают **int** (ID) или **str** (имя — создаётся автоматически). Все сущности сохраняются в одной транзакции |
| `PUT` 🔒 | `/todos/tasks/{task_id}` | `TaskUpdate` | `TaskResponse` | Частичное обновление задачи. Поддерживает смену `due_date`, `schedule_date`, перемещение между проектами/секциями |
| `DELETE` 🔒 | `/todos/tasks/{task_id}` | — | 204 No Content | Удалить задачу |

#### Виртуальный проект «Все задачи»

```
GET /todos/data → {
  "projects": [
    {
      "id": "all_tasks",           // строковой сентинел (не int)
      "name": "Все задачи",
      "color": "#6366f1",
      "sections": [],
      "inbox_tasks": [             // ВСЕ активные задачи пользователя (flat)
        { ...task из inbox },
        { ...task из проекта A, секции 1 },
        { ...task из проекта B },
        ...
      ]
    },
    { "id": 1, "name": "Проект А", ... },  // реальные проекты
    ...
  ],
  "inbox_tasks": [...]  // глобальный inbox (задачи без проекта)
}
```

#### Схема `SectionUpdate`

```python
class SectionUpdate(BaseModel):
    name: Optional[str] = None                 # новое имя (для rename или rename целевого при merge)
    merge_into_section_id: Optional[int] = None  # ID целевого раздела для слияния
```

**Логика `PUT /todos/sections/{section_id}`:**

| `name` | `merge_into_section_id` | Результат |
|--------|------------------------|-----------|
| ✅ | ❌ | Переименовать исходный раздел |
| ❌ | ✅ | Переместить задачи в целевой, удалить исходный |
| ✅ | ✅ | Переместить задачи + переименовать целевой |
| ❌ | ❌ | HTTP 400 |

**Схемы:**
```python
class ProjectCreate(BaseModel):
    name: str
    color: str = "#6366f1"   # HEX

class SectionCreate(BaseModel):
    project_id: int
    name: str
    position: int = 0

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    # Принимают int (ID) ИЛИ str (имя для создания на лету) ИЛИ None
    project_id: Optional[Union[int, str]] = None
    section_id: Optional[Union[int, str]] = None
    due_date: Optional[datetime] = None            # Дедлайн (крайний срок)
    schedule_date: Optional[datetime] = None       # Дата выполнения (планируемая)
    duration_minutes: Optional[int] = 30           # Длительность в минутах (1–1440)
    priority: int = Field(default=4, ge=1, le=4)
    # Валидатор: "5" → 5 (int), "Мат. анализ" → str, пустая строка → None

class TaskUpdate(BaseModel):
    title: Optional[str]
    description: Optional[str]
    project_id: Optional[int]          # только int для обновления
    section_id: Optional[int]          # только int для обновления
    due_date: Optional[datetime]
    schedule_date: Optional[datetime]
    duration_minutes: Optional[int]    # ge=1, le=1440
    priority: Optional[int]            # ge=1, le=4
    is_completed: Optional[bool]

class TaskResponse(BaseModel):
    # ... все поля Task
    due_date: Optional[datetime]
    schedule_date: Optional[datetime]
    duration_minutes: Optional[int]    # default=30 для старых записей

class TodosDataResponse(BaseModel):
    projects: List[ProjectWithDataResponse]  # Проекты с секциями и задачами
    inbox_tasks: List[TaskResponse]          # Задачи без проекта
```

**Логика создания задачи на лету (str project_id/section_id):**

| `project_id` | `section_id` | Поведение |
|---|---|---|
| `None` | `None` | Задача во Входящих |
| `5` (int) | `None` | Задача в проекте #5, без секции |
| `"Мат. анализ"` (str) | `None` | Создаётся Project "Мат. анализ", задача в нём |
| `5` (int) | `"Лекции"` (str) | Создаётся Section "Лекции" в проекте #5 |
| `"Физика"` (str) | `"1 семестр"` (str) | Создаётся Project "Физика" + Section "1 семестр" |

---

### 3.7 Notifications (`/notifications`) — `backend/notifications.py`

Лента in-app уведомлений. Уведомления создаются бэкенд-сервисами (планировщик дедлайнов, генератор пожеланий) и читаются мобильным клиентом. Все эндпоинты защищены JWT.

| Метод | URL | Схема запроса | Схема ответа | Описание |
|-------|-----|--------------|--------------|----------|
| `GET` 🔒 | `/notifications` | — | `List[NotificationResponse]` | Все уведомления текущего пользователя, отсортированные по `created_at DESC` (новейшие первые). Включает прочитанные и непрочитанные |
| `GET` 🔒 | `/notifications/unread-count` | — | `UnreadCountResponse` | Количество непрочитанных уведомлений для бейджа колокольчика. Быстрый запрос без загрузки тел |
| `PATCH` 🔒 | `/notifications/{id}/read` | `NotificationUpdate` | `NotificationResponse` | Отметить одно уведомление прочитанным (или снять отметку, если `is_read=False`). 404 если не найдено или принадлежит другому пользователю |
| `POST` 🔒 | `/notifications/read-all` | — | `{status, marked: int}` | Bulk UPDATE: отметить все непрочитанные уведомления текущего пользователя как прочитанные за один SQL-запрос. Возвращает количество затронутых строк |
| `POST` 🔒 | `/notifications/trigger-magic` | — | `NotificationResponse` | Тестовый мгновенный пуш. Случайно вызывает `generate_morning_wish` или `generate_evening_wish` для текущего пользователя и сразу пишет карточку в ленту, не дожидаясь 08:00 / 22:30 |
| `POST` 🔒 | `/notifications` | `NotificationCreate` | `NotificationResponse` | Создать уведомление для текущего пользователя. **Основные вызывающие:** фоновые задачи и планировщики (дедлайны, пожелания). В продакшене может быть ограничен до сервисного токена |

**Схемы:**

```python
class NotificationCreate(BaseModel):
    title:     str            # 1–200 символов, заголовок
    body:      str            # 0–2000 символов, тело уведомления
    category:  str            # "tasks" | "reminders" | "wishes"  (валидируется)
    image_url: Optional[str]  # только путь под /static/memes/, иначе 422
    push_slot: Optional[str]  # "morning" | "evening" | null

class NotificationUpdate(BaseModel):
    is_read: bool = True   # по умолчанию True (отметить прочитанным)

class NotificationResponse(BaseModel):
    id:         int
    user_id:    int
    title:      str
    body:       str
    category:   str
    image_url:  Optional[str]
    push_slot:  Optional[str]   # "morning" | "evening" | null
    is_read:    bool
    created_at: datetime

class UnreadCountResponse(BaseModel):
    count: int   # количество непрочитанных
```

**Категории:**

| `category` | Назначение |
|------------|------------|
| `tasks` | Просроченные дедлайны, предстоящие дедлайны (сгенерированы из таблицы tasks) |
| `reminders` | Вечерняя поддержка (слот `evening`) и прочие напоминания учёбы |
| `wishes` | Утренние пожелания, слот `morning` |

---

### 3.7.1 Умные пожелания (`backend/wishes.py`)

Фоновая задача внутри процесса FastAPI (lifespan в `main.py`, цикл `async`). Отдельный cron-пакет не нужен. Каждые 30 секунд планировщик читает текущую минуту **Новосибирска (UTC+7)** и сравнивает её с `wake_time` и `sleep_time` каждого пользователя. Совпадение минуты запускает пуш. Некорректная строка в колонке заменяется дефолтом `08:00` / `22:30`.

| Совпадение | Слот | Функция | `category` | `push_slot` |
|------------|------|---------|------------|-------------|
| `HH:MM` == `users.wake_time` | утро | `generate_morning_wish(user_id)` | `wishes` | `morning` |
| `HH:MM` == `users.sleep_time` | вечер | `generate_evening_wish(user_id)` | `reminders` | `evening` |

Если у студента уже есть карточка этого `push_slot` за текущие новосибирские сутки, второй раз за день она не создаётся. Тестовый `POST /notifications/trigger-magic` тоже пишет `push_slot`, поэтому крон в этот день повторную карточку того же слота не создаст. Время меняется через `PATCH /auth/profile/schedule`.

**Утро.** Вариация выбирается случайно, затем уходит в GigaChat вместе с `UserFact` (имя, пол, интересы):

- милое пожелание на день с эмодзи;
- предсказание («У тебя будет прекрасный день!»);
- шуточное поздравление с неофициальным праздником (День торта, День апельсина).

Погода Новосибирска берётся из Open-Meteo (`latitude=55.0415`, `longitude=82.9346`, дневной `weather_code` / вероятность и сумма осадков). Если обещают дождь, в текст добавляется: «Сегодня будет дождик. Не забудь зонтик! ☔». Сбой погоды или GigaChat не роняет задачу: карточка всё равно пишется, для модели есть короткий запасной текст.

**Вечер.** Берутся задачи, у которых `due_date` или `schedule_date` попадает в текущие новосибирские сутки (в БД naive UTC, клиент шлёт `toISOString()`).

- Есть задачи на сегодня и у всех `is_completed = true` → похвала вроде «Умничка! Ты выполнила все задачи на день. Отдыхай! 🌟». Род глагола GigaChat согласует с фактами.
- Часть задач открыта, либо задач на сегодня нет → поддержка: «Я с тобой. Ты всё делаешь правильно. Обнимаю! 🤗» или предложение почитать книгу / включить спокойную музыку. Пустой список не считается «все задачи выполнены».

**Картинка.** GigaChat может вернуть имя файла из `backend/static/memes/`. Сервер принимает только реальное имя из этой папки и пишет `image_url = /static/memes/<файл>`. Каталог пустой — поле остаётся `null`.

---

### Итоговая таблица всех эндпоинтов

| # | Метод | Путь | Auth | Роутер |
|---|-------|------|------|--------|
| 1 | GET | `/` | — | main |
| 2 | POST | `/ask` | — | main |
| 3 | POST | `/auth/register/init` | — | auth |
| 4 | POST | `/auth/register/verify` | — | auth |
| 5 | POST | `/auth/login` | — | auth |
| 6 | POST | `/auth/login/verify` | — | auth |
| 7 | POST | `/auth/nstu-login` | — | auth |
| 8 | GET | `/auth/me` | 🔒 | auth |
| 9 | DELETE | `/auth/delete` | 🔒 | auth |
| 10 | PATCH | `/auth/2fa` | 🔒 | auth |
| 11 | POST | `/auth/password-reset/request` | 🔒 | auth |
| 12 | POST | `/auth/password-reset/confirm` | 🔒 | auth |
| 13 | POST | `/auth/set-password` | 🔒 | auth |
| 14 | PATCH | `/auth/profile/schedule` | 🔒 | auth |
| 15 | POST | `/auth/chats/save` | 🔒 | auth |
| 16 | GET | `/auth/chats` | 🔒 | auth |
| 17 | GET | `/auth/sessions` | 🔒 | auth |
| 18 | DELETE | `/auth/sessions/other` | 🔒 | auth |
| 19 | DELETE | `/auth/sessions/{session_id}` | 🔒 | auth |
| 20 | POST | `/sync/parse-cabinet` | 🔒 | parser |
| 21 | GET | `/sync/student-data` | 🔒 | parser |
| 22 | POST | `/subjects` | 🔒 | subjects |
| 23 | GET | `/subjects` | 🔒 | subjects |
| 24 | POST | `/subjects/{id}/scores` | 🔒 | subjects |
| 25 | DELETE | `/subjects/{id}/scores/{score_id}` | 🔒 | subjects |
| 26 | GET | `/notes` | 🔒 | notes |
| 27 | POST | `/notes` | 🔒 | notes |
| 28 | PUT | `/notes/{note_id}` | 🔒 | notes |
| 29 | DELETE | `/notes/{note_id}` | 🔒 | notes |
| 30 | GET | `/profile/facts` | 🔒 | facts |
| 31 | POST | `/profile/facts` | 🔒 | facts |
| 32 | PUT | `/profile/facts/{fact_id}` | 🔒 | facts |
| 33 | DELETE | `/profile/facts/all` | 🔒 | facts |
| 34 | DELETE | `/profile/facts/{fact_id}` | 🔒 | facts |
| 35 | GET | `/todos/data` | 🔒 | todos |
| 36 | POST | `/todos/projects` | 🔒 | todos |
| 37 | POST | `/todos/sections` | 🔒 | todos |
| 38 | PUT | `/todos/sections/{section_id}` | 🔒 | todos |
| 39 | POST | `/todos/tasks` | 🔒 | todos |
| 40 | PUT | `/todos/tasks/{task_id}` | 🔒 | todos |
| 41 | DELETE | `/todos/tasks/{task_id}` | 🔒 | todos |
| 42 | GET | `/notifications` | 🔒 | notifications |
| 43 | GET | `/notifications/unread-count` | 🔒 | notifications |
| 44 | PATCH | `/notifications/{id}/read` | 🔒 | notifications |
| 45 | POST | `/notifications/read-all` | 🔒 | notifications |
| 46 | POST | `/notifications/trigger-magic` | 🔒 | notifications |
| 47 | POST | `/notifications` | 🔒 | notifications |

---

## 4. Инструкция для ИИ-агентов

> **ОБЯЗАТЕЛЬНО прочитай этот раздел перед внесением любых изменений в кодовую базу BYTE.**

### Правило №1 — Сначала читай, потом пиши

Перед любым изменением кода:
1. Прочти этот файл `ARCHITECTURE.md` целиком.
2. Найди нужный файл по карте в разделе 1 (фронтенд) или разделах 2–3 (бэкенд).
3. Прочти сам файл перед редактированием.

### Правило №2 — Обнови этот файл после изменений

После внесения изменений **обязательно обнови `ARCHITECTURE.md`**, если:
- **Добавлена/изменена таблица БД** → обнови раздел 2 (добавь колонки, измени типы, добавь связи).
- **Добавлен/изменён/удалён API-эндпоинт** → обнови раздел 3 (метод, URL, схемы, описание) и итоговую таблицу.
- **Добавлен новый экран или компонент** → обнови раздел 1 (дерево файлов + таблицу маппинга).
- **Изменились Pydantic-схемы** (`backend/models.py`) → обнови соответствующий подраздел 3.x.

### Правило №3 — Структура файлов бэкенда

```
backend/
├── main.py             # FastAPI app, CORS, подключение роутеров, /ask эндпоинт
├── database.py         # SQLAlchemy модели + миграции (_run_migrations)
├── models.py           # Все Pydantic-схемы запросов и ответов
├── auth.py             # Роутер /auth: login, register, sessions, 2FA, password
├── parser.py           # Роутер /sync: парсинг ЛК НГТУ через GigaChat
├── subjects.py         # Роутер /subjects: ручные предметы и баллы
├── notes.py            # Роутер /notes: markdown заметки
├── facts.py            # Роутер /profile: AI-память студента (UserFacts)
├── todos.py            # Роутер /todos: таск-менеджер (Project/Section/Task)
├── notifications.py    # Роутер /notifications: in-app уведомления (лента, бейдж, read-all, trigger-magic)
├── wishes.py           # generate_morning_wish / generate_evening_wish; планировщик сверяет минуту Новосибирска с wake_time и sleep_time
└── static/memes/       # Картинки для Notification.image_url (котики, meme_2, meme_3, meme_5, …)
```

### Правило №4 — Структура фронтенда

- **Экраны** живут в `frontend/src/screens/` — это единственное место с логикой.
- **Файлы в `app/`** — только тонкие re-export через `export { default } from '...'`. Логику туда не добавлять.
- **API-запросы** оборачиваются в `src/api/http.ts → apiFetch()`, который автоматически добавляет заголовок `Authorization: Bearer <token>` и обрабатывает 401.
- **Глобальное состояние** через `AuthContext` и `NotificationsContext` (лента / колокольчик / локальные пуши). Новые контексты добавлять только при крайней необходимости.
- **Expo SDK 57**: перед использованием любого Expo-пакета читай актуальную документацию на `https://docs.expo.dev/versions/v57.0.0/`.

### Правило №5 — Безопасность

- **JWT** содержит `{sub: email, id: user_id, session_id}`. Проверка сессии в БД выполняется при **каждом** запросе через `resolve_user()` в `auth.py`.
- **Cascade deletes:** удаление `User` автоматически удаляет все его данные (chats, notes, facts, sessions, tasks, projects, subjects, notifications). Проверяй каскады при добавлении новых FK.
- **Изоляция данных:** каждый роутер проверяет `user_id == current_user.id` перед доступом к записи. Никогда не убирай эту проверку.

---

*Файл сгенерирован автоматически по аудиту репозитория. Последнее обновление: **октябрь 2026**.*
*При изменении структуры проекта обновляй этот файл вместе с кодом.*
