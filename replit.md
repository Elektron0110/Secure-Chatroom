# Messenger — конфигурация проекта Replit

## Обзор

Веб-мессенджер на Python/Flask с реальным временем через WebSocket и базой данных SQLite через SQLAlchemy ORM.

Главная документация: **[README.md](README.md)**
Архитектура системы: **[ARCHITECTURE.md](ARCHITECTURE.md)**

## Технологический стек

- **Backend:** Python 3.11, Flask 3, flask-sock (WebSocket), SQLAlchemy 2.0 ORM
- **База данных:** SQLite3 через SQLAlchemy 2.0 ORM (файл `messenger.db`)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (без фреймворков)
- **Авторизация:** токен-сессии в памяти (Bearer token + cookie)
- **Логирование:** кастомный класс `Log` из `my_lib.py`

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
├── replit.md           # Конфигурация проекта Replit
├── pyproject.toml      # Python-зависимости
├── messenger.db        # SQLite база данных (автосоздание)
├── server/
│   ├── app.py          # Весь бэкенд: Flask API, WebSocket, ORM-модели
│   ├── index.ts        # Node.js-обёртка для Replit-воркфлоу
│   ├── my_lib.py       # Модуль логирования (класс Log)
│   ├── static/
│   │   ├── style.css   # Все CSS-стили
│   │   ├── app.js      # Весь клиентский JavaScript
│   │   └── avatars/    # Аватары пользователей и групповых чатов
│   └── templates/
│       └── index.html  # SPA (HTML-структура)
```

## Порты

| Локальный | Внешний | Назначение |
|---|---|---|
| 5000 | 5000 | Flask-приложение (основное) |

## Пользовательские настройки

- Документация ведётся на русском языке
- Главный файл документации: README.md в корне проекта
- База данных: SQLite через SQLAlchemy (не PostgreSQL)
