# Messenger — веб-мессенджер на Python/Flask

## Описание

Веб-приложение для обмена сообщениями в реальном времени. Реализовано на Python (Flask) с интерактивным веб-интерфейсом на чистом HTML/CSS/JavaScript. Поддерживает WebSocket для мгновенной доставки сообщений.

## Технологический стек

- **Backend:** Python 3.11, Flask 3, flask-sock (WebSocket), psycopg2
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (без фреймворков)
- **База данных:** PostgreSQL (Replit Database)
- **Авторизация:** токен-сессии в памяти (Bearer token + cookie)

## Структура проекта

```
server/
├── app.py              # Весь бэкенд: Flask API, WebSocket, работа с БД
├── index.ts            # Вспомогательный запускатор для воркфлоу Replit
└── templates/
    └── index.html      # Полноценное SPA-приложение (HTML + CSS + JS)
pyproject.toml          # Python-зависимости
replit.md               # Этот файл
ARCHITECTURE.md         # Подробная документация архитектуры
```

## API-эндпоинты

### Страницы
- `GET /` — веб-приложение (SPA)
- `GET /status` — проверка состояния сервера

### Аутентификация
- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход
- `POST /api/auth/logout` — выход
- `GET /api/auth/me` — данные текущего пользователя

### Чаты
- `GET /api/chats` — список чатов пользователя
- `POST /api/chats` — создать чат
- `DELETE /api/chats/<id>` — удалить чат

### Сообщения
- `GET /api/chats/<id>/messages` — сообщения чата
- `POST /api/chats/<id>/messages` — отправить сообщение
- `POST /api/chats/<id>/read` — отметить как прочитанные

### Пользователи
- `GET /api/users/search?q=...` — поиск пользователей

### WebSocket
- `GET /ws?token=<token>` — WebSocket-соединение для реального времени

## Схема базы данных

### users
| Поле | Тип | Описание |
|---|---|---|
| id | VARCHAR (UUID) | Первичный ключ |
| username | TEXT UNIQUE | Логин |
| password | TEXT | SHA-256 хеш |
| display_name | TEXT | Отображаемое имя |
| avatar_url | TEXT | URL аватара |
| is_online | BOOLEAN | Онлайн-статус |
| last_seen | TIMESTAMP | Последний визит |

### chats
| Поле | Тип | Описание |
|---|---|---|
| id | VARCHAR (UUID) | Первичный ключ |
| name | TEXT | Название (для групп) |
| is_group | BOOLEAN | Групповой чат |
| updated_at | TIMESTAMP | Время последнего сообщения |

### chat_participants
- Связь many-to-many между users и chats
- Каскадное удаление при удалении чата

### messages
| Поле | Тип | Описание |
|---|---|---|
| content | TEXT | Текст сообщения |
| sender_id | VARCHAR | Автор сообщения |
| is_read | BOOLEAN | Прочитано ли |

## Запуск

### Разработка

Воркфлоу **Start Backend** запускает сервер:
```
npm run server:dev → tsx server/index.ts → python server/app.py
```
Приложение доступно на порту 5000.

### Продакшн (деплой)
```
python server/app.py
```

## Особенности архитектуры

- Сессии хранятся в памяти (`sessions = {}`) — при перезапуске сервера пользователи выходят из системы
- WebSocket-клиенты отслеживаются в `ws_clients = {}` в памяти
- Таблицы БД создаются автоматически при старте через `init_db()`
- Хеширование паролей: SHA-256
- Frontend: SPA на чистом JS, без внешних зависимостей
- Реальное время: WebSocket через flask-sock + резервный polling каждые 3.5с

## Функциональность

- Регистрация и вход пользователей
- Поиск пользователей для создания чатов
- Список чатов с превью последнего сообщения
- Реальное время через WebSocket
- Индикаторы онлайн-статуса
- Счётчики непрочитанных сообщений
- Удаление чатов
- Светлая / тёмная тема
- Адаптивный дизайн (мобильный + десктоп)
