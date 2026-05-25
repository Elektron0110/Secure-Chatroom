# Messenger — Архитектура системы

> Подробная документация всех модулей и принципов работы приложения.
> Главный файл документации: [README.md](README.md)

---

## Содержание

1. [Общая схема](#1-общая-схема)
2. [База данных (SQLAlchemy + SQLite)](#2-база-данных-sqlalchemy--sqlite)
3. [Серверная часть (server/app.py)](#3-серверная-часть-serverapppy)
4. [Фронтенд (server/templates/index.html)](#4-фронтенд-servertemplatesindexhtml)
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
server/app.py  (Python 3.11 + Flask 3)
         │
         │ SQLAlchemy ORM
         ▼
SQLite3 (messenger.db — файл в корне проекта)
```

**Порт:** 5000 (externalPort=5000 в .replit)

**Запуск в разработке:**
```
npm run server:dev
  → tsx server/index.ts
    → python server/app.py  (PORT=5000)
```

`server/index.ts` — тонкая Node.js-обёртка, нужная только для запуска через воркфлоу Replit. Весь код приложения — на Python.

---

## 2. База данных (SQLAlchemy + SQLite)

### Движок и сессия

```python
engine = create_engine(
    "sqlite:///messenger.db",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
```

- `check_same_thread=False` — необходимо для Flask, где каждый запрос обрабатывается в отдельном потоке.
- `autocommit=False` — транзакции управляются вручную через `db.commit()`.

### Включение внешних ключей в SQLite

SQLite по умолчанию не проверяет внешние ключи. Включается через PRAGMA:

```python
@event.listens_for(Engine, "connect")
def enable_foreign_keys(dbapi_conn, _):
    if isinstance(dbapi_conn, sqlite3.Connection):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
```

Это обеспечивает каскадное удаление: при удалении `Chat` автоматически удаляются все `ChatParticipant` и `Message`.

### Инициализация таблиц

```python
def init_db():
    Base.metadata.create_all(engine)
```

Вызывается один раз при старте. Создаёт все таблицы, если они не существуют.

### Паттерн сессии на запрос

```python
db = SessionLocal()
try:
    # работа с БД
    db.commit()
finally:
    db.close()
```

Каждый HTTP-маршрут открывает и закрывает сессию через `try/finally`, чтобы гарантировать освобождение ресурсов.

---

### ORM-модели

#### `User`

```python
class User(Base):
    __tablename__ = "users"
    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username     = Column(String, nullable=False, unique=True)
    password     = Column(String, nullable=False)       # SHA-256
    display_name = Column(String, nullable=False)
    avatar_url   = Column(String)
    is_online    = Column(Boolean, default=False)
    last_seen    = Column(DateTime, default=datetime.utcnow)
    created_at   = Column(DateTime, default=datetime.utcnow)
```

#### `Chat`

```python
class Chat(Base):
    __tablename__ = "chats"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String)                         # None для личных чатов
    is_group   = Column(Boolean, default=False)
    avatar_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    participants = relationship("ChatParticipant", back_populates="chat", cascade="all, delete-orphan")
    messages     = relationship("Message",         back_populates="chat", cascade="all, delete-orphan")
```

#### `ChatParticipant`

```python
class ChatParticipant(Base):
    __tablename__ = "chat_participants"
    id        = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id   = Column(String, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    user_id   = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    chat = relationship("Chat", back_populates="participants")
    user = relationship("User")
```

#### `Message`

```python
class Message(Base):
    __tablename__ = "messages"
    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id           = Column(String, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    sender_id         = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content           = Column(Text, nullable=False)
    encrypted_content = Column(Text)
    is_read           = Column(Boolean, default=False)
    created_at        = Column(DateTime, default=datetime.utcnow)

    chat   = relationship("Chat", back_populates="messages")
    sender = relationship("User")
```

### Индексы

```python
Index("ix_cp_chat_id",    ChatParticipant.chat_id)
Index("ix_cp_user_id",    ChatParticipant.user_id)
Index("ix_msg_chat_id",   Message.chat_id)
Index("ix_msg_sender_id", Message.sender_id)
```

---

## 3. Серверная часть (server/app.py)

Единственный файл бэкенда. Содержит ORM-модели, маршруты HTTP, WebSocket, аутентификацию.

### Глобальные объекты

```python
app = Flask(__name__)   # Flask-приложение
sock = Sock(app)        # WebSocket через flask-sock

sessions = {}           # { token: user_id } — активные сессии (в памяти)
ws_clients = {}         # { user_id: ws } — WebSocket-подключения (в памяти)
```

Оба словаря живут в памяти процесса. При перезапуске сервера все сессии и WS-соединения теряются.

---

### Вспомогательные функции

**`hash_password(password)`** — SHA-256, возвращает hex-строку.

**`generate_token()`** — `secrets.token_hex(32)`, криптографически стойкий токен.

**`dt_iso(dt)`** — сериализация `datetime` в ISO-строку.

**`user_dict(u)`** — преобразование ORM-объекта `User` в JSON-словарь с camelCase-ключами.

**`message_dict(m)`** — преобразование `Message` (с вложенным `sender`) в JSON-словарь.

**`chat_dict(chat, current_user_id, db)`** — полная сериализация чата: участники, последнее сообщение, счётчик непрочитанных.

---

### Декоратор `@auth_required`

Применяется ко всем защищённым маршрутам. Ищет токен в двух местах:

1. Заголовок `Authorization: Bearer <token>`
2. Cookie `token`

При успехе добавляет `request.user_id` и `request.token`.

---

### `setup_cors()`

Разрешает CORS-запросы от:
- Доменов Replit (`REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`)
- `localhost:*` и `127.0.0.1:*` для локальной разработки

---

### `broadcast_to_chat(chat_id, message_data, exclude_user_id)`

Рассылает JSON всем WebSocket-клиентам в `ws_clients`. Если клиент отвалился — удаляет его из `ws_clients`.

---

### HTTP-маршруты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/` | Отдаёт веб-приложение (index.html) |
| GET | `/status` | `{"status": "ok"}` |
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Профиль текущего пользователя |
| GET | `/api/chats` | Список чатов |
| POST | `/api/chats` | Создать чат |
| DELETE | `/api/chats/<id>` | Удалить чат |
| GET | `/api/chats/<id>/messages` | Сообщения чата (последние 50) |
| POST | `/api/chats/<id>/messages` | Отправить сообщение |
| POST | `/api/chats/<id>/read` | Отметить прочитанными |
| GET | `/api/users/search?q=...` | Поиск пользователей |

---

### Детали ключевых маршрутов

**`GET /api/chats`**

```python
chat_ids = [r.chat_id for r in db.query(ChatParticipant.chat_id).filter_by(user_id=user_id)]
chats = db.query(Chat).filter(Chat.id.in_(chat_ids)).order_by(Chat.updated_at.desc()).all()
return [chat_dict(c, user_id, db) for c in chats]
```

**`POST /api/chats/<id>/messages`**

```python
msg = Message(chat_id=chat_id, sender_id=user_id, content=content)
db.add(msg)
chat.updated_at = datetime.utcnow()
db.commit()
broadcast_to_chat(chat_id, message_dict(msg), exclude_user_id=user_id)
```

**`GET /api/users/search`**

```python
pattern = f"%{query.lower()}%"
users = db.query(User).filter(
    User.id != user_id,
    func.lower(User.username).like(pattern) | func.lower(User.display_name).like(pattern)
).limit(20).all()
```

**`WebSocket /ws`**

```python
@sock.route("/ws")
def websocket_handler(ws):
    user_id = sessions[token]
    ws_clients[user_id] = ws
    user.is_online = True
    while True:
        data = ws.receive()  # блокирующее ожидание
        # обработка ping и других событий
    # при отключении: is_online = False, last_seen = now
```

---

## 4. Фронтенд (server/templates/index.html)

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

### Функция `api(method, path, body)`

Универсальная обёртка над `fetch()` с Bearer-токеном в заголовке.

### WebSocket (клиент)

```javascript
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws?token=${state.token}`);
  ws.onmessage = (e) => { /* обновить чат или список */ };
  ws.onclose = () => { setTimeout(connectWs, 5000); }; // переподключение
}
```

### Адаптивный дизайн

| Экран | Поведение |
|---|---|
| Десктоп (> 680px) | Боковая панель (360px) + область чата |
| Мобильный (≤ 680px) | Полноэкранный список ИЛИ полноэкранный чат |

### Темы оформления

Управляется через `data-theme` атрибут на `<html>`. CSS-переменные переключаются через `[data-theme="dark"] { ... }`. Выбор сохраняется в `localStorage`.

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
db.add(Message(...))
chat.updated_at = datetime.utcnow()
db.commit()
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

*Документация актуальна: май 2026*
