# Messenger — Архитектура системы

> Подробная документация всех модулей и принципов работы приложения.

---

## Содержание

1. [Общая схема](#1-общая-схема)
2. [Серверная часть (server/app.py)](#2-серверная-часть-serverapppy)
3. [Фронтенд (server/templates/index.html)](#3-фронтенд-servertemplatesindexhtml)
4. [База данных](#4-база-данных)
5. [Аутентификация](#5-аутентификация)
6. [WebSocket и реальное время](#6-websocket-и-реальное-время)
7. [Жизненный цикл запроса](#7-жизненный-цикл-запроса)

---

## 1. Общая схема

```
Браузер (HTML/CSS/JS)
         │
         │ HTTP REST API + WebSocket
         ▼
server/app.py  (Python 3.11 + Flask)
         │
         │ psycopg2
         ▼
PostgreSQL (Replit Database)
```

**Порт:** 5000

**Запуск в разработке:**
```
npm run server:dev
  → tsx server/index.ts
    → python server/app.py
```

`server/index.ts` — тонкая Node.js-обёртка, нужная только для запуска через воркфлоу Replit. Весь код приложения — на Python.

---

## 2. Серверная часть (server/app.py)

Единственный файл бэкенда. Содержит всё: маршруты HTTP, WebSocket, работу с базой данных, аутентификацию.

### Глобальные объекты

```python
app = Flask(__name__)   # Flask-приложение
sock = Sock(app)        # WebSocket через flask-sock

sessions = {}           # { token: user_id } — активные сессии (в памяти)
ws_clients = {}         # { user_id: ws } — WebSocket-подключения (в памяти)
```

Оба словаря живут в памяти процесса. При перезапуске сервера все сессии и WS-соединения теряются.

---

### Функция `init_db()`

Вызывается один раз при старте. Создаёт 4 таблицы и 4 индекса (если не существуют):

```sql
users, chats, chat_participants, messages
индексы: по chat_id и user_id в chat_participants, по chat_id и sender_id в messages
```

---

### Функция `get_db()`

```python
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn
```

Новое соединение создаётся на каждый запрос. `autocommit = True` — каждый INSERT/UPDATE сразу фиксируется, явный `commit()` не нужен.

---

### Функция `hash_password(password)`

SHA-256 без соли. Возвращает hex-строку из 64 символов.

---

### Декоратор `@auth_required`

Применяется ко всем защищённым маршрутам. Ищет токен в двух местах:

1. Заголовок `Authorization: Bearer <token>`
2. Cookie `token`

При успехе добавляет `request.user_id` и `request.token`.

---

### Функция `setup_cors()`

Разрешает CORS-запросы от:
- Доменов Replit (`REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`)
- `localhost:*` и `127.0.0.1:*` для локальной разработки

---

### Функция `broadcast_to_chat(chat_id, message_data, exclude_user_id)`

Рассылает JSON всем WebSocket-клиентам, которые являются участниками чата. Если клиент отвалился — удаляет его из `ws_clients`.

---

### HTTP-маршруты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/` | Отдаёт веб-приложение (index.html) |
| GET | `/status` | Проверка состояния сервера → `{"status": "ok"}` |
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Профиль текущего пользователя |
| GET | `/api/chats` | Список чатов (с участниками, последним сообщением, счётчиком непрочитанных) |
| POST | `/api/chats` | Создать чат |
| DELETE | `/api/chats/<id>` | Удалить чат |
| GET | `/api/chats/<id>/messages` | Сообщения чата (последние 50) |
| POST | `/api/chats/<id>/messages` | Отправить сообщение |
| POST | `/api/chats/<id>/read` | Отметить сообщения прочитанными |
| GET | `/api/users/search?q=...` | Поиск пользователей (ILIKE) |

---

### Детали маршрутов

**`GET /api/chats`**

Для каждого чата пользователя:
1. Выборка участников с их данными
2. JOIN с последним сообщением
3. Подсчёт непрочитанных сообщений
4. Сортировка по `updated_at DESC`

**`POST /api/chats/<id>/messages`**

1. Вставка сообщения в БД
2. Обновление `updated_at` чата
3. WebSocket-рассылка другим участникам

**`GET /api/users/search`**

```sql
SELECT ... FROM users
WHERE (LOWER(username) LIKE %q% OR LOWER(display_name) LIKE %q%)
AND id != <текущий_пользователь>
LIMIT 20
```

**`WebSocket /ws`**

```python
@sock.route("/ws")
def websocket_handler(ws):
    token = request.args.get("token")
    # проверка токена
    ws_clients[user_id] = ws
    while True:
        data = ws.receive()  # блокирующее ожидание
        # обработка входящих событий (typing, ping и т.д.)
```

---

## 3. Фронтенд (server/templates/index.html)

Одностраничное приложение (SPA) на чистом HTML5 + CSS3 + Vanilla JavaScript. Никаких npm-пакетов, никаких фреймворков.

### Структура HTML

```
body
├── #auth           — экраны аутентификации
│   ├── #login-view   — форма входа
│   └── #register-view — форма регистрации
├── #app            — основное приложение
│   ├── #sidebar      — список чатов
│   │   ├── #sidebar-header (логотип, тема)
│   │   ├── #search-bar (поиск по чатам)
│   │   └── #chat-list (список)
│   └── #chat-area    — область переписки
│       ├── #chat-placeholder (заглушка)
│       └── #chat-view (переписка)
│           ├── #chat-header
│           ├── #messages (пузырьки)
│           └── #input-area (поле ввода)
├── #new-chat-modal  — модал создания чата
├── #delete-modal    — подтверждение удаления
├── #profile-panel   — панель профиля
└── #toast           — уведомления
```

---

### Состояние (JavaScript `state`)

```javascript
const state = {
  user: null,          // данные текущего пользователя
  token: null,         // Bearer-токен
  chats: [],           // список чатов
  currentChatId: null, // открытый чат
  messages: [],        // сообщения открытого чата
  ws: null,            // WebSocket-соединение
  chatPolling: null,   // setInterval для обновления списка чатов
  msgPolling: null,    // setInterval для обновления сообщений
};
```

---

### Функция `api(method, path, body)`

Универсальная обёртка над `fetch()`:

```javascript
async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(data.error);
  return res.json();
}
```

---

### Жизненный цикл сессии (фронтенд)

```
init()
  ├── checkAuth() — читает токен из localStorage
  │     ├── Успех → showApp()
  │     └── Ошибка → showAuth()
  │
showApp():
  ├── renderChatList()
  ├── connectWs()   — WebSocket-соединение
  └── startPolling() — резервный polling каждые 3.5/6 сек
```

Токен и данные пользователя сохраняются в `localStorage`:
- `localStorage['token']` — токен
- `localStorage['user']` — JSON пользователя

---

### WebSocket (клиент)

```javascript
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws?token=${state.token}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    // добавляем в открытый чат или обновляем список
  };
  ws.onclose = () => {
    setTimeout(connectWs, 5000); // переподключение
  };
}
```

При получении сообщения:
1. Если чат открыт — добавляем пузырёк в DOM
2. Обновляем список чатов

---

### Отправка сообщения

```javascript
async function sendMessage() {
  const content = input.value.trim();
  await api('POST', `/api/chats/${chatId}/messages`, { content });
  // ответ сервера содержит полные данные сообщения
  appendMessage(msg, true);
  loadChats(); // обновить список чатов
}
```

---

### Адаптивный дизайн

| Экран | Поведение |
|---|---|
| Десктоп (> 680px) | Боковая панель (360px) + область чата |
| Мобильный (≤ 680px) | Полноэкранный список ИЛИ полноэкранный чат, переключение |

---

### Темы оформления

Управляется через `data-theme` атрибут на `<html>`:

```javascript
function toggleTheme() {
  html.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('theme', html.dataset.theme);
}
```

CSS-переменные переключаются автоматически через `[data-theme="dark"] { ... }`.

---

## 4. База данных

### Таблица `users`

```sql
CREATE TABLE users (
    id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username     TEXT NOT NULL UNIQUE,
    password     TEXT NOT NULL,          -- SHA-256 хеш
    display_name TEXT NOT NULL,
    avatar_url   TEXT,
    is_online    BOOLEAN DEFAULT FALSE,
    last_seen    TIMESTAMP DEFAULT NOW(),
    created_at   TIMESTAMP DEFAULT NOW()
);
```

### Таблица `chats`

```sql
CREATE TABLE chats (
    id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name       TEXT,                     -- null для личных чатов
    is_group   BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()   -- обновляется при новом сообщении
);
```

### Таблица `chat_participants`

```sql
CREATE TABLE chat_participants (
    id        VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    chat_id   VARCHAR NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id   VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT NOW()
);
-- индексы по chat_id и user_id
```

### Таблица `messages`

```sql
CREATE TABLE messages (
    id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    chat_id           VARCHAR NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id         VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    encrypted_content TEXT,
    is_read           BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMP DEFAULT NOW()
);
-- индексы по chat_id и sender_id
```

**Каскадное удаление:** при удалении чата автоматически удаляются `chat_participants` и `messages`.

---

## 5. Аутентификация

```
Вход/Регистрация
  │
  ▼
Flask генерирует token = secrets.token_hex(32)
sessions[token] = user_id
  │
  ├── Ответ JSON: { user, token }
  └── Set-Cookie: token=<token>; httponly; SameSite=Lax
  │
Клиент сохраняет в localStorage
  │
Последующие запросы:
  Authorization: Bearer <token>
  │
@auth_required:
  token in sessions → request.user_id = sessions[token]
```

---

## 6. WebSocket и реальное время

### Доставка сообщений

```
Пользователь A отправляет сообщение
  │
  ▼
POST /api/chats/<id>/messages
  │
  ▼
INSERT INTO messages
UPDATE chats SET updated_at = NOW()
  │
  ▼
broadcast_to_chat(chat_id, message_data)
  │
  ├── ws_clients[user_B].send(JSON)  → Пользователь B получает мгновенно
  └── ws_clients[user_C].send(JSON)  → Пользователь C получает мгновенно
```

### Резервный polling

Если WebSocket недоступен (или при первой загрузке):

- Список чатов: обновляется каждые **6 секунд**
- Сообщения: обновляются каждые **3.5 секунды**

---

## 7. Жизненный цикл запроса

### Открытие переписки

```
Клик по чату в списке
  ↓
openChat(chatId)
  ├── renderChatHeader() — показать имя и статус
  ├── GET /api/chats/<id>/messages
  ├── renderMessages() — отрисовка пузырьков
  ├── scrollMessages() — прокрутка вниз
  └── POST /api/chats/<id>/read — отметить как прочитанные
```

### Отправка сообщения

```
Нажатие Enter / кнопки Send
  ↓
sendMessage()
  ├── api('POST', /api/chats/<id>/messages, { content })
  ├── appendMessage() — добавить пузырёк в DOM (мгновенно)
  └── loadChats() — обновить список чатов
```

### Получение сообщения (WebSocket)

```
ws.onmessage → msg = JSON.parse(event.data)
  ├── Если msg.chatId === currentChatId:
  │     appendMessage() + scrollMessages() + markRead()
  └── loadChats() — обновить список чатов
```

---

*Документация актуальна: апрель 2026*
