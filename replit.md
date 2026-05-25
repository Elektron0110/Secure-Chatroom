# Messenger — конфигурация проекта Replit

## Обзор

Веб-мессенджер на Python/Flask с реальным временем через WebSocket и базой данных SQLite через SQLAlchemy ORM.

Главная документация: **[README.md](README.md)**
Архитектура системы: **[ARCHITECTURE.md](ARCHITECTURE.md)**

## Технологический стек

- **Backend:** Python 3.11, Flask 3, flask-sock (WebSocket)
- **База данных:** SQLite3 через SQLAlchemy 2.0 ORM (файл `messenger.db`)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (без фреймворков)
- **Авторизация:** токен-сессии в памяти (Bearer token + cookie)

## Запуск

Воркфлоу **Start Backend** запускает сервер:
```
npm run server:dev → tsx server/index.ts → python server/app.py (PORT=5000)
```

Приложение доступно на **порту 5000**.  
База данных `messenger.db` создаётся автоматически в корне проекта.

## Структура проекта

```
├── README.md           # Главная документация проекта
├── ARCHITECTURE.md     # Подробная архитектура системы
├── pyproject.toml      # Python-зависимости
├── messenger.db        # SQLite база данных (автосоздание)
├── server/
│   ├── app.py          # Весь бэкенд: Flask API, WebSocket, ORM-модели
│   ├── index.ts        # Node.js-обёртка для Replit-воркфлоу
│   └── templates/
│       └── index.html  # SPA (HTML + CSS + JS)
```

## Порты

| Локальный | Внешний | Назначение |
|---|---|---|
| 5000 | 5000 | Flask-приложение (основное) |

## Пользовательские настройки

- Документация ведётся на русском языке
- Главный файл документации: README.md в корне проекта
- База данных: SQLite через SQLAlchemy (не PostgreSQL)
