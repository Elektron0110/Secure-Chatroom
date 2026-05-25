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
│   └── templates/
│       └── index.html          # SPA-приложение (HTML + CSS + JS)
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
| POST | `/api/auth/register` | Регистрация нового пользователя |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Данные текущего пользователя |

### Чаты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/chats` | Список чатов (с превью и счётчиком непрочитанных) |
| POST | `/api/chats` | Создать чат |
| DELETE | `/api/chats/<id>` | Удалить чат |

### Сообщения

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/chats/<id>/messages` | Последние 50 сообщений чата |
| POST | `/api/chats/<id>/messages` | Отправить сообщение |
| POST | `/api/chats/<id>/read` | Отметить как прочитанные |

### Пользователи и WebSocket

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/users/search?q=...` | Поиск пользователей (LIKE) |
| GET | `/status` | Статус сервера |
| WS | `/ws?token=<token>` | WebSocket-соединение реального времени |

## Схема базы данных (SQLAlchemy ORM)

### Модель `User`

| Поле | Тип SQLAlchemy | Описание |
|---|---|---|
| id | String (UUID) | Первичный ключ, генерируется в Python |
| username | String, UNIQUE | Логин |
| password | String | SHA-256 хеш |
| display_name | String | Отображаемое имя |
| avatar_url | String | URL аватара |
| is_online | Boolean | Онлайн-статус |
| last_seen | DateTime | Последний визит |
| created_at | DateTime | Дата регистрации |

### Модель `Chat`

| Поле | Тип SQLAlchemy | Описание |
|---|---|---|
| id | String (UUID) | Первичный ключ |
| name | String | Название (только для групповых) |
| is_group | Boolean | Групповой чат |
| avatar_url | String | URL аватара |
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
- Поиск пользователей и создание личных чатов
- Список чатов с превью последнего сообщения
- Обмен сообщениями в реальном времени (WebSocket + резервный polling)
- Индикаторы онлайн-статуса
- Счётчики непрочитанных сообщений
- Удаление чатов
- Светлая и тёмная тема
- Адаптивный дизайн (мобильный + десктоп)

## Архитектурные особенности

- **SQLite + SQLAlchemy ORM** — база данных хранится в файле `messenger.db`. Таблицы создаются автоматически через `Base.metadata.create_all()`. Внешние ключи с CASCADE включены через `PRAGMA foreign_keys=ON`.
- **Сессия на запрос** — каждый HTTP-запрос открывает и закрывает `SessionLocal()` через `try/finally`.
- **UUID в Python** — идентификаторы генерируются через `uuid.uuid4()`, а не на стороне БД.
- **Сессии в памяти** — `sessions = {}` хранит токены. При перезапуске сервера все пользователи выходят из системы.
- **WebSocket-клиенты в памяти** — `ws_clients = {}`. При перезапуске соединения рвутся, клиент переподключается автоматически.
- **Пароли** — SHA-256. Достаточно для прототипа; для продакшна рекомендуется bcrypt.

## Подробная документация

Смотрите [ARCHITECTURE.md](ARCHITECTURE.md) — детальное описание всех модулей, ORM-моделей, маршрутов и жизненного цикла запросов.
