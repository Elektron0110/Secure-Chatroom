# Messenger

Веб-мессенджер с обменом сообщениями в реальном времени. Написан на Python (Flask) с фронтендом на чистом HTML/CSS/JavaScript без сторонних фреймворков.

## Технологический стек

| Компонент | Технология |
|---|---|
| Backend | Python 3.11, Flask 3 |
| WebSocket | flask-sock |
| База данных | SQLite3 через SQLAlchemy 2.0 (ORM) |
| Frontend | HTML5, CSS3, Vanilla JS |
| Авторизация | Bearer-токен + cookie (в памяти) |

## Структура проекта

```
messenger/
├── README.md                   # Этот файл — главная документация
├── ARCHITECTURE.md             # Подробная архитектура системы
├── pyproject.toml              # Python-зависимости
├── messenger.db                # SQLite база данных (создаётся автоматически)
├── server/
│   ├── app.py                  # Весь бэкенд: API, WebSocket, ORM-модели
│   ├── index.ts                # Node.js-обёртка для запуска через Replit
│   ├── static/
│   │   ├── style.css           # Все стили приложения
│   │   ├── app.js              # Весь клиентский JavaScript
│   │   └── avatars/            # Загруженные аватары пользователей
│   └── templates/
│       └── index.html          # SPA-шаблон (только HTML-структура)
```

## Быстрый старт

### Требования

- Python 3.11+
- Зависимости из `pyproject.toml`

### Запуск (разработка)

```bash
python server/app.py
```

Или через Replit-воркфлоу **Start Backend**:

```
npm run server:dev
  → tsx server/index.ts
    → python server/app.py  (PORT=5000)
```

Приложение доступно на `http://localhost:5000`.  
База данных `messenger.db` создаётся автоматически в корне проекта при первом запуске.

## API

### Аутентификация

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/register` | Регистрация (username, password, displayName, recoveryCode) |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Данные текущего пользователя |
| POST | `/api/auth/avatar` | Загрузка аватара (multipart/form-data, поле `avatar`) |
| PATCH | `/api/auth/profile` | Изменить отображаемое имя и/или имя пользователя |
| POST | `/api/auth/reset-password` | Сброс пароля через код восстановления |

### Чаты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/chats` | Список чатов (с превью и счётчиком непрочитанных) |
| POST | `/api/chats` | Создать личный или групповой чат |
| DELETE | `/api/chats/<id>` | Удалить чат |

**Создание чата** `POST /api/chats`:
```json
{ "participantIds": ["uid1"], "name": null, "isGroup": false }
```
Для группового чата: `"isGroup": true` и обязательное `"name"`.

### Сообщения

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/chats/<id>/messages` | Последние 50 сообщений чата |
| POST | `/api/chats/<id>/messages` | Отправить сообщение |
| POST | `/api/chats/<id>/read` | Отметить как прочитанные |
| DELETE | `/api/messages/<msg_id>` | Удалить сообщение (только отправитель) |

### Пользователи и WebSocket

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/users/search?q=...` | Поиск пользователей (LIKE) |
| GET | `/status` | Статус сервера |
| WS | `/ws?token=<token>` | WebSocket-соединение реального времени |

**Типы WebSocket-сообщений от сервера:**
- `{"type":"message","chatId":"...","data":{...}}` — новое сообщение
- `{"type":"delete_message","chatId":"...","messageId":"..."}` — удаление сообщения
- `{"type":"pong"}` — ответ на ping

## Схема базы данных (SQLAlchemy ORM)

### Модель `User`

| Поле | Тип SQLAlchemy | Описание |
|---|---|---|
| id | String (UUID) | Первичный ключ, генерируется в Python |
| username | String, UNIQUE | Логин |
| password | String | SHA-256 хеш |
| recovery_code | String | SHA-256 хеш 8-значного кода для сброса пароля |
| display_name | String | Отображаемое имя |
| avatar_url | String | Путь к файлу аватара (`/static/avatars/<uuid>.<ext>`) |
| is_online | Boolean | Онлайн-статус |
| last_seen | DateTime | Последний визит |
| created_at | DateTime | Дата регистрации |

### Модель `Chat`

| Поле | Тип SQLAlchemy | Описание |
|---|---|---|
| id | String (UUID) | Первичный ключ |
| name | String | Название (обязательно для групповых) |
| is_group | Boolean | Групповой чат |
| avatar_url | String | URL аватара группы |
| created_at | DateTime | Дата создания |
| updated_at | DateTime | Время последнего сообщения |

### Модель `ChatParticipant`

Связь many-to-many между `User` и `Chat`. Каскадное удаление при удалении чата.

| Поле | Тип SQLAlchemy | Описание |
|---|---|---|
| id | String (UUID) | Первичный ключ |
| chat_id | String, FK → Chat.id | CASCADE |
| user_id | String, FK → User.id | CASCADE |
| joined_at | DateTime | Дата вступления |

### Модель `Message`

| Поле | Тип SQLAlchemy | Описание |
|---|---|---|
| id | String (UUID) | Первичный ключ |
| chat_id | String, FK → Chat.id | CASCADE |
| sender_id | String, FK → User.id | CASCADE |
| content | Text | Текст сообщения |
| encrypted_content | Text | Зашифрованный текст (опционально) |
| is_read | Boolean | Прочитано ли |
| created_at | DateTime | Время отправки |

## Зависимости (`pyproject.toml`)

```toml
dependencies = [
    "flask>=3.1.3",
    "flask-cors>=6.0.2",
    "flask-sock>=0.7.0",
    "sqlalchemy>=2.0.0",
    "simple-websocket>=1.1.0",
]
```

## Возможности

- Регистрация и вход пользователей
- Сброс пароля через 8-значный код восстановления
- Загрузка и отображение аватара пользователя
- Изменение отображаемого имени и имени пользователя прямо из профиля
- Поиск пользователей и создание личных чатов
- Создание групповых чатов с произвольным числом участников
- Список чатов с превью последнего сообщения
- Обмен сообщениями в реальном времени (WebSocket + резервный polling)
- Выборочное удаление своих сообщений (с уведомлением всех участников через WS)
- Индикаторы онлайн-статуса
- Счётчики непрочитанных сообщений
- Удаление чатов
- Светлая и тёмная тема
- Адаптивный дизайн (мобильный + десктоп)

## Архитектурные особенности

- **SQLite + SQLAlchemy ORM** — база данных хранится в файле `messenger.db`. Таблицы создаются автоматически через `Base.metadata.create_all()`. Внешние ключи с CASCADE включены через `PRAGMA foreign_keys=ON`.
- **Статические файлы** — CSS и JS вынесены в `server/static/`. Flask раздаёт их по маршруту `/static/`. Аватары сохраняются в `server/static/avatars/<user_id>.<ext>`.
- **Разделение фронтенда** — `index.html` содержит только HTML-структуру, `style.css` — все стили, `app.js` — весь клиентский код.
- **Сессия на запрос** — каждый HTTP-запрос открывает и закрывает `SessionLocal()` через `try/finally`.
- **UUID в Python** — идентификаторы генерируются через `uuid.uuid4()`, а не на стороне БД.
- **Сессии в памяти** — `sessions = {}` хранит токены. При перезапуске сервера все пользователи выходят из системы.
- **WebSocket-клиенты в памяти** — `ws_clients = {}`. При перезапуске соединения рвутся, клиент переподключается автоматически.
- **Пароли** — SHA-256. Достаточно для прототипа; для продакшна рекомендуется bcrypt.
- **Мобильный viewport** — мета-тег `viewport-fit=cover` + `overflow: hidden` на `html/body` предотвращают выход контента за пределы экрана.

## Подробная документация

Смотрите [ARCHITECTURE.md](ARCHITECTURE.md) — детальное описание всех модулей, ORM-моделей, маршрутов и жизненного цикла запросов.
