# Messenger

Веб-мессенджер с обменом сообщениями в реальном времени. Написан на Python (Flask) с фронтендом на чистом HTML/CSS/JavaScript без сторонних фреймворков.

## Технологический стек

| Компонент | Технология |
|---|---|
| Backend | Python 3.11, Flask 3 |
| WebSocket | flask-sock |
| База данных | PostgreSQL (psycopg2) |
| Frontend | HTML5, CSS3, Vanilla JS |
| Авторизация | Bearer-токен + cookie (в памяти) |

## Структура проекта

```
messenger/
├── README.md                   # Этот файл — главная документация
├── ARCHITECTURE.md             # Подробная архитектура системы
├── pyproject.toml              # Python-зависимости
├── server/
│   ├── app.py                  # Весь бэкенд: API, WebSocket, БД
│   ├── index.ts                # Node.js-обёртка для запуска через Replit
│   └── templates/
│       └── index.html          # SPA-приложение (HTML + CSS + JS)
```

## Быстрый старт

### Требования

- Python 3.11+
- PostgreSQL (или Replit Database)
- Переменная окружения `DATABASE_URL`

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
| GET | `/api/users/search?q=...` | Поиск пользователей (ILIKE) |
| GET | `/status` | Статус сервера |
| WS | `/ws?token=<token>` | WebSocket-соединение реального времени |

## Схема базы данных

### Таблица `users`

| Поле | Тип | Описание |
|---|---|---|
| id | VARCHAR (UUID) | Первичный ключ |
| username | TEXT UNIQUE | Логин |
| password | TEXT | SHA-256 хеш |
| display_name | TEXT | Отображаемое имя |
| avatar_url | TEXT | URL аватара |
| is_online | BOOLEAN | Онлайн-статус |
| last_seen | TIMESTAMP | Последний визит |
| created_at | TIMESTAMP | Дата регистрации |

### Таблица `chats`

| Поле | Тип | Описание |
|---|---|---|
| id | VARCHAR (UUID) | Первичный ключ |
| name | TEXT | Название (только для групповых) |
| is_group | BOOLEAN | Групповой чат |
| avatar_url | TEXT | URL аватара |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Время последнего сообщения |

### Таблица `chat_participants`

Связь many-to-many между `users` и `chats`. Каскадное удаление при удалении чата.

| Поле | Тип | Описание |
|---|---|---|
| id | VARCHAR (UUID) | Первичный ключ |
| chat_id | VARCHAR | FK → chats.id (CASCADE) |
| user_id | VARCHAR | FK → users.id (CASCADE) |
| joined_at | TIMESTAMP | Дата вступления |

### Таблица `messages`

| Поле | Тип | Описание |
|---|---|---|
| id | VARCHAR (UUID) | Первичный ключ |
| chat_id | VARCHAR | FK → chats.id (CASCADE) |
| sender_id | VARCHAR | FK → users.id (CASCADE) |
| content | TEXT | Текст сообщения |
| is_read | BOOLEAN | Прочитано ли |
| created_at | TIMESTAMP | Время отправки |

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

- **Сессии в памяти** — `sessions = {}` хранит токены. При перезапуске сервера все пользователи выходят из системы.
- **WebSocket-клиенты в памяти** — `ws_clients = {}`. При перезапуске соединения рвутся, клиент переподключается автоматически.
- **Таблицы БД** создаются автоматически при старте через `init_db()` (CREATE TABLE IF NOT EXISTS).
- **Пароли** — SHA-256 без соли. Достаточно для прототипа, для продакшна рекомендуется bcrypt.
- **Одно соединение с БД на запрос** — `get_db()` открывает соединение с `autocommit=True`.

## Подробная документация

Смотрите [ARCHITECTURE.md](ARCHITECTURE.md) — детальное описание всех модулей, маршрутов, фронтенд-архитектуры и жизненного цикла запросов.
