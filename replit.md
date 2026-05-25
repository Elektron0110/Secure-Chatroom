# Messenger — конфигурация проекта Replit

## Обзор

Веб-мессенджер на Python/Flask с реальным временем через WebSocket.
Главная документация: **[README.md](README.md)**
Архитектура системы: **[ARCHITECTURE.md](ARCHITECTURE.md)**

## Технологический стек

- **Backend:** Python 3.11, Flask 3, flask-sock (WebSocket), psycopg2
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (без фреймворков)
- **База данных:** PostgreSQL (Replit Database)
- **Авторизация:** токен-сессии в памяти (Bearer token + cookie)

## Запуск

Воркфлоу **Start Backend** запускает сервер:
```
npm run server:dev → tsx server/index.ts → python server/app.py (PORT=5000)
```

Приложение доступно на **порту 5000** (externalPort=5000 в .replit).

## Структура проекта

```
├── README.md           # Главная документация проекта
├── ARCHITECTURE.md     # Подробная архитектура системы
├── pyproject.toml      # Python-зависимости
├── server/
│   ├── app.py          # Весь бэкенд: Flask API, WebSocket, БД
│   ├── index.ts        # Node.js-обёртка для Replit-воркфлоу
│   └── templates/
│       └── index.html  # SPA (HTML + CSS + JS)
```

## Порты

| Локальный | Внешний | Назначение |
|---|---|---|
| 5000 | 5000 | Flask-приложение (основное) |
| 8081 | 80 | Expo (не используется, занят Expo Go) |

## Пользовательские настройки

- Документация ведётся на русском языке
- Главный файл документации: README.md в корне проекта
