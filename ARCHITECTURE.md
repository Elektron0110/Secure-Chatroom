# Messenger — Архитектура системы

> Подробная документация всех модулей и принципов работы приложения.
> Главный файл документации: [README.md](README.md)

---

## Содержание

1. [Общая схема](#1-общая-схема)
2. [База данных (SQLAlchemy + SQLite)](#2-база-данных-sqlalchemy--sqlite)
3. [Серверная часть (server/app.py)](#3-серверная-часть-serverapppy)
4. [Фронтенд](#4-фронтенд)
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
    # Автоматическая миграция: добавить recovery_code если столбца нет
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN recovery_code VARCHAR"))
            conn.commit()
        except Exception:
            pass  # уже существует
```

Вызывается один раз при старте.

### Паттерн сессии на запрос

```python
db = SessionLocal()
try:
    # работа с БД
    db.commit()
finally:
    db.close()
```

---

### ORM-модели

#### `User`

```python
class User(Base):
    __tablename__ = "users"
    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username      = Column(String, nullable=False, unique=True)
    password      = Column(String, nullable=False)       # SHA-256
    recovery_code = Column(String)                       # SHA-256 (8-значный код)
    display_name  = Column(String, nullable=False)
    avatar_url    = Column(String)                       # /static/avatars/<uuid>.<ext>
    is_online     = Column(Boolean, default=False)
    last_seen     = Column(DateTime)
    created_at    = Column(DateTime)
```

#### `Chat`

```python
class Chat(Base):
    __tablename__ = "chats"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String)                    # None для личных, обязательно для групп
    is_group   = Column(Boolean, default=False)
    avatar_url = Column(String)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

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
    joined_at = Column(DateTime)

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
    created_at        = Column(DateTime)

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
STATIC_DIR  = server/static/          # Flask static_folder
AVATARS_DIR = server/static/avatars/  # загруженные аватары

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='/static')
sock = Sock(app)

sessions   = {}   # { token: user_id } — активные сессии (в памяти)
ws_clients = {}   # { user_id: ws }   — WebSocket-подключения (в памяти)
```

Оба словаря живут в памяти процесса. При перезапуске сервера все сессии и WS-соединения теряются.

---

### Вспомогательные функции

**`hash_password(password)`** — SHA-256, возвращает hex-строку. Используется и для паролей, и для кодов восстановления.

**`generate_token()`** — `secrets.token_hex(32)`, криптографически стойкий токен.

**`dt_iso(dt)`** — сериализация `datetime` в ISO-строку.

**`user_dict(u)`** — преобразование ORM-объекта `User` в JSON-словарь с camelCase-ключами (включая `avatarUrl`).

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

| Метод | Путь | Auth | Описание |
|---|---|---|---|
| GET | `/` | — | Отдаёт веб-приложение (index.html) |
| GET | `/static/<path>` | — | Статические файлы (CSS, JS, аватары) |
| GET | `/status` | — | `{"status": "ok"}` |
| POST | `/api/auth/register` | — | Регистрация |
| POST | `/api/auth/login` | — | Вход |
| POST | `/api/auth/logout` | ✓ | Выход |
| GET | `/api/auth/me` | ✓ | Профиль текущего пользователя |
| POST | `/api/auth/avatar` | ✓ | Загрузка аватара (multipart) |
| POST | `/api/auth/reset-password` | — | Сброс пароля через код |
| GET | `/api/chats` | ✓ | Список чатов пользователя |
| POST | `/api/chats` | ✓ | Создать личный или групповой чат |
| DELETE | `/api/chats/<id>` | ✓ | Удалить чат |
| GET | `/api/chats/<id>/messages` | ✓ | Сообщения (последние 50) |
| POST | `/api/chats/<id>/messages` | ✓ | Отправить сообщение |
| POST | `/api/chats/<id>/read` | ✓ | Отметить как прочитанные |
| DELETE | `/api/messages/<id>` | ✓ | Удалить сообщение (только отправитель) |
| GET | `/api/users/search?q=...` | ✓ | Поиск пользователей |
| WS | `/ws?token=<token>` | — | WebSocket |

---

### Детали ключевых маршрутов

**`POST /api/auth/avatar`**

Принимает `multipart/form-data` с полем `avatar`. Сохраняет файл в `server/static/avatars/<user_id>.<ext>`, обновляет `user.avatar_url` в БД. Возвращает `{ avatarUrl, user }`.

**`DELETE /api/messages/<msg_id>`**

Проверяет, что `msg.sender_id == request.user_id`. Удаляет из БД. Рассылает всем участникам чата через WebSocket:
```json
{ "type": "delete_message", "chatId": "...", "messageId": "..." }
```

**`POST /api/chats`**

```python
{ "participantIds": ["uid1", "uid2"], "name": "Название", "isGroup": true }
```
Для личных чатов `name=null`, `isGroup=false`. Создатель автоматически добавляется в `all_ids = set([user_id] + participantIds)`.

**`GET /api/chats`**

```python
chat_ids = [r.chat_id for r in db.query(ChatParticipant.chat_id).filter_by(user_id=user_id)]
chats = db.query(Chat).filter(Chat.id.in_(chat_ids)).order_by(Chat.updated_at.desc()).all()
return [chat_dict(c, user_id, db) for c in chats]
```

**WebSocket `/ws`**

```python
@sock.route("/ws")
def websocket_handler(ws):
    user_id = sessions[token]
    ws_clients[user_id] = ws
    user.is_online = True
    while True:
        data = ws.receive()  # блокирующее ожидание
        msg = json.loads(data)
        if msg.get("type") == "ping":
            ws.send(json.dumps({"type": "pong"}))
    # при отключении: is_online = False, last_seen = now
```

---

## 4. Фронтенд

Одностраничное приложение (SPA) на чистом HTML5 + CSS3 + Vanilla JavaScript. Никаких npm-пакетов, никаких фреймворков.

### Структура файлов

```
server/
├── templates/
│   └── index.html       # HTML-структура (только разметка)
└── static/
    ├── style.css         # Все CSS-стили
    ├── app.js            # Весь клиентский JavaScript
    └── avatars/          # Аватары пользователей
        └── <uuid>.png
```

`index.html` ссылается на внешние файлы:
```html
<link rel="stylesheet" href="/static/style.css">
<script src="/static/app.js"></script>
```

### Структура HTML

```
body
├── #auth           — экраны аутентификации
│   ├── #login-view       — форма входа
│   ├── #register-view    — форма регистрации
│   └── #reset-view       — форма сброса пароля
├── #app            — основное приложение
│   ├── #sidebar      — боковая панель с чатами
│   │   ├── #sidebar-header (аватар, название, тема)
│   │   ├── #search-bar (поиск по чатам)
│   │   ├── #chat-list (список)
│   │   └── .new-chat-btn (кнопка + в левом нижнем углу)
│   └── #chat-area    — область переписки
│       ├── #chat-placeholder (заглушка «выберите чат»)
│       └── #chat-view
│           ├── #chat-header (назад, аватар, имя, удалить)
│           ├── #messages (пузырьки с кнопками удаления)
│           └── #input-area (поле ввода + отправка)
├── #new-chat-modal     — модал: вкладки Личный / Группа
├── #delete-modal       — подтверждение удаления чата
├── #delete-msg-modal   — подтверждение удаления сообщения
├── #profile-panel      — панель профиля с аватаром
└── #toast              — всплывающие уведомления
```

### Состояние (JavaScript `state`)

```javascript
const state = {
  user: null,              // данные текущего пользователя
  token: null,             // Bearer-токен
  chats: [],               // список чатов
  currentChatId: null,     // открытый чат
  messages: [],            // сообщения открытого чата
  ws: null,                // WebSocket-соединение
  chatPolling: null,       // setInterval для обновления чатов
  msgPolling: null,        // setInterval для обновления сообщений
  deleteTargetId: null,    // id чата для удаления
  deleteMsgTargetId: null, // id сообщения для удаления
  groupMode: false,        // режим создания группы
  selectedUserIds: new Set(), // выбранные участники группы
};
```

### Функция `api(method, path, body)`

Универсальная обёртка над `fetch()` с Bearer-токеном в заголовке. `apiForm()` — вариант для `multipart/form-data` (загрузка аватара).

### Загрузка аватара

```javascript
async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  const data = await apiForm('POST', '/api/auth/avatar', formData);
  state.user = { ...state.user, avatarUrl: data.avatarUrl };
  updateAvatarDisplays();
}
```

Кнопка — клик по аватару в профиле, открывает скрытый `<input type="file">`.

### Групповые чаты

В модале создания чата — две вкладки: **Личный чат** | **Группа**.  
В режиме группы:
- Появляется поле ввода названия
- Пользователи добавляются в `state.selectedUserIds` через клик (с галочкой)
- Над списком — бейджи выбранных участников с кнопкой ×
- Кнопка «Создать группу» — вызывает `createGroupChat(name, [...ids])`

### Удаление сообщений

При наведении на своё сообщение появляется кнопка удаления (иконка корзины).  
Клик → модал подтверждения → `deleteMessage(msgId)` → `DELETE /api/messages/<id>`.  
WebSocket-событие `delete_message` удаляет сообщение у всех участников без перезагрузки.

### WebSocket (клиент)

```javascript
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws?token=${state.token}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'message') { /* новое сообщение */ }
    if (msg.type === 'delete_message') { /* удалить из DOM */ }
  };
  ws.onclose = () => { setTimeout(connectWs, 5000); }; // переподключение
}
```

### Адаптивный дизайн

| Экран | Поведение |
|---|---|
| Десктоп (> 680px) | Боковая панель 360px + область чата |
| Мобильный (≤ 680px) | Полноэкранный список ИЛИ полноэкранный чат |

**Исправление мобильного viewport:**  
Мета-тег `viewport-fit=cover` + `overflow: hidden` на `html` и `body` устраняют проблему, при которой страница рендерилась шире видимой области.

---

## 5. Аутентификация

```
Регистрация: { username, password, displayName, recoveryCode }
  │
  ▼
Сервер: hash(password), hash(recoveryCode) → сохраняет в User
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

**Сброс пароля:** `POST /api/auth/reset-password` — сравнивает `hash(recoveryCode)` с хешом в БД, при совпадении устанавливает новый пароль.

---

## 6. WebSocket и реальное время

### Доставка нового сообщения

```
Пользователь A → POST /api/chats/<id>/messages
  ↓
db.add(Message) + chat.updated_at = now()
  ↓
broadcast_to_chat(chat_id, data, exclude_user_id=A)
  ├── ws_clients[B].send({"type":"message","chatId":...,"data":{...}})
  └── ws_clients[C].send(...)
```

### Удаление сообщения

```
Пользователь A → DELETE /api/messages/<msg_id>
  ↓
Проверка sender_id == A
db.delete(msg)
  ↓
Для всех ws_clients:
  ws.send({"type":"delete_message","chatId":...,"messageId":...})
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
  ├── renderChatHeader() — показать имя/аватар, статус участников
  ├── GET /api/chats/<id>/messages
  ├── renderMessages() — отрисовка пузырьков с кнопками удаления
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
  ├── type === 'message':
  │     appendMessage() + scrollMessages() + markRead()
  │     loadChats()
  └── type === 'delete_message':
        удалить элемент из DOM по data-msg-id
        loadChats()
```

### Загрузка аватара

```
Клик на аватар в профиле
  ↓
<input type="file"> → пользователь выбирает файл
  ↓
uploadAvatar(file)
  ├── POST /api/auth/avatar (multipart)
  ├── Сервер сохраняет файл в static/avatars/<uuid>.<ext>
  ├── Обновляет user.avatar_url в БД
  └── Клиент обновляет все отображения аватара (сайдбар, профиль, заголовки чатов)
```

---

*Документация актуальна: май 2026*
