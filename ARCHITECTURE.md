# Messenger — Подробная документация архитектуры

> Полное описание каждого модуля, компонента и принципа работы приложения.

---

## Содержание

1. [Общая архитектура системы](#1-общая-архитектура-системы)
2. [Серверная часть (Backend)](#2-серверная-часть-backend)
   - [server/index.ts](#21-serverindexts)
   - [server/app.py](#22-serverapppy)
3. [Клиентская часть (Frontend)](#3-клиентская-часть-frontend)
   - [Точка входа](#31-точка-входа)
   - [Провайдеры и контекст](#32-провайдеры-и-контекст)
   - [Навигация](#33-навигация)
   - [Экраны (Screens)](#34-экраны-screens)
   - [Компоненты (Components)](#35-компоненты-components)
   - [Хуки (Hooks)](#36-хуки-hooks)
   - [Библиотеки (Lib)](#37-библиотеки-lib)
   - [Константы (Constants)](#38-константы-constants)
4. [База данных](#4-база-данных)
5. [Жизненный цикл запроса](#5-жизненный-цикл-запроса)
6. [Шифрование сообщений](#6-шифрование-сообщений)
7. [Аутентификация](#7-аутентификация)
8. [Реальное время (WebSocket)](#8-реальное-время-websocket)

---

## 1. Общая архитектура системы

```
┌─────────────────────────────────────────────────────────────┐
│                  КЛИЕНТ (React Native / Expo)                │
│                                                             │
│  index.js → App.tsx → Providers → Navigation → Screens      │
│                                                             │
│  Порт: 8081 (Expo Dev Server / Metro Bundler)               │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTP REST API + WebSocket
                           │  (Authorization: Bearer <token>)
┌──────────────────────────▼──────────────────────────────────┐
│                  СЕРВЕР (Python / Flask)                     │
│                                                             │
│  server/index.ts → запускает → server/app.py                │
│                                                             │
│  Порт: 5000                                                  │
│  • REST API (/api/*)                                         │
│  • WebSocket (/ws)                                          │
│  • Лендинг (/) с QR-кодом для Expo Go                       │
│  • Статические файлы (/assets/*)                            │
└──────────────────────────┬──────────────────────────────────┘
                           │  psycopg2 (прямые SQL-запросы)
┌──────────────────────────▼──────────────────────────────────┐
│              PostgreSQL (Replit Database)                    │
│                                                             │
│  Таблицы: users, chats, chat_participants, messages          │
└─────────────────────────────────────────────────────────────┘
```

**Принцип работы целиком:**
1. Workflow `Start Backend` запускает `npm run server:dev` → `tsx server/index.ts` → дочерний процесс `python server/app.py`
2. Workflow `Start Frontend` запускает Expo Metro Bundler на порту 8081
3. Пользователь открывает приложение в Expo Go (скан QR) или в браузере
4. Клиент делает HTTP-запросы к бэкенду (порт 5000)
5. Бэкенд читает/пишет в PostgreSQL через psycopg2

---

## 2. Серверная часть (Backend)

### 2.1 `server/index.ts`

**Назначение:** Тонкая TypeScript-обёртка, которая запускает Python-сервер как дочерний процесс. Нужна потому, что Replit-воркфлоу настроен на команду `npm run server:dev`, которая выполняет `tsx server/index.ts`.

**Что делает:**
- Через Node.js `child_process.spawn` запускает `python server/app.py`
- Пробрасывает все переменные окружения в дочерний процесс (`env: { ...process.env }`)
- Пробрасывает stdin/stdout/stderr дочернего процесса напрямую в терминал (`stdio: "inherit"`)
- При получении `SIGINT` или `SIGTERM` корректно останавливает Python-сервер
- При аварийном завершении Python завершается сам с тем же кодом

**Почему не запускать Python напрямую:** Replit управляет воркфлоу через `package.json` scripts, которые нельзя изменять. Этот файл — единственный способ цепочки `npm → tsx → python`.

---

### 2.2 `server/app.py`

Главный и единственный бэкенд-файл. Написан на Python 3.11 с использованием Flask.

#### Импорты и глобальные переменные

```python
app = Flask(__name__)
sock = Sock(app)        # WebSocket поддержка через flask-sock
sessions = {}           # { token: user_id } — хранилище сессий в памяти
ws_clients = {}         # { user_id: WebSocket } — активные WS-соединения
DATABASE_URL = os.environ.get("DATABASE_URL")
```

`sessions` — это в-памяти словарь. При перезапуске сервера все токены теряются и пользователи выходят из системы. Это намеренное решение для простоты.

#### Функция `get_db()`

```python
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn
```

Создаёт новое соединение с PostgreSQL при каждом вызове. `autocommit = True` означает, что каждый SQL-запрос фиксируется немедленно без явного `conn.commit()`. Соединение закрывается в конце каждого обработчика маршрута.

#### Функция `init_db()`

Вызывается один раз при старте приложения. Создаёт 4 таблицы (если не существуют) и 4 индекса для ускорения частых запросов:

- `chat_participants_chat_id_idx` — для поиска участников чата
- `chat_participants_user_id_idx` — для поиска чатов пользователя
- `messages_chat_id_idx` — для выборки сообщений чата
- `messages_sender_id_idx` — для фильтрации по отправителю

#### Функция `hash_password(password)`

```python
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()
```

Однократное SHA-256 хеширование. Пароль кодируется в UTF-8, хешируется, результат возвращается как hex-строка (64 символа).

#### Функция `generate_token()`

```python
def generate_token():
    return secrets.token_hex(32)
```

Генерирует криптографически стойкий случайный токен длиной 64 hex-символа (32 байта) с помощью стандартного модуля `secrets`. Используется как Bearer-токен при аутентификации.

#### Функция `serialize_datetime(obj)` и `user_to_dict(row, keys)`

`user_to_dict` превращает кортеж из psycopg2 в Python-словарь и применяет переименование ключей из snake_case в camelCase (для совместимости с фронтендом на TypeScript):

| SQL-поле | JSON-поле |
|---|---|
| `display_name` | `displayName` |
| `avatar_url` | `avatarUrl` |
| `is_online` | `isOnline` |
| `last_seen` | `lastSeen` |
| `created_at` | `createdAt` |
| `sender_id` | `senderId` |
| `encrypted_content` | `encryptedContent` |
| `is_read` | `isRead` |
| `is_group` | `isGroup` |
| `updated_at` | `updatedAt` |

#### Декоратор `@auth_required`

```python
def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            cookie_token = request.cookies.get("token")
            if cookie_token:
                token = cookie_token
        if not token or token not in sessions:
            return jsonify({"error": "Unauthorized"}), 401
        request.user_id = sessions[token]
        request.token = token
        return f(*args, **kwargs)
    return decorated
```

Применяется ко всем защищённым маршрутам. Проверяет токен в двух местах:
1. HTTP-заголовок `Authorization: Bearer <token>`
2. Cookie `token`

При успехе добавляет `request.user_id` и `request.token` для использования в обработчике.

#### Функция `setup_cors()`

Настраивает CORS (Cross-Origin Resource Sharing) для разрешения запросов от:
- Домена Replit dev (`REPLIT_DEV_DOMAIN`)
- Всех доменов из `REPLIT_DOMAINS`
- `localhost:*` и `127.0.0.1:*` (для локальной разработки)

Регистрирует два хука:
- `@app.after_request` — добавляет CORS-заголовки к каждому ответу
- `@app.before_request` — обрабатывает preflight OPTIONS-запросы

#### Функция `broadcast_to_chat(chat_id, message_data, exclude_user_id)`

Рассылает сообщение всем подключённым WebSocket-клиентам (из `ws_clients`). Если отправка падает с ошибкой (клиент отключился), он удаляется из словаря. Параметр `exclude_user_id` позволяет не отправлять сообщение обратно его автору.

#### Маршруты

**`GET /`** — Лендинг
- Если заголовок `expo-platform` равен `ios` или `android` — отдаёт манифест для статической сборки Expo
- Иначе — читает `server/templates/landing-page.html`, подставляет переменные `BASE_URL_PLACEHOLDER`, `EXPS_URL_PLACEHOLDER`, `APP_NAME_PLACEHOLDER` и возвращает HTML-страницу с QR-кодом

**`GET /manifest`** — Манифест для Expo статической сборки

**`GET /assets/<path>`** — Статические ресурсы (PNG, иконки и т.д.)

**`GET /static-build/<path>`** — Файлы статической сборки Expo

---

**`POST /api/auth/register`**

Входные данные: `{ username, password, displayName }`

Логика:
1. Валидация: username ≥ 3 символов, password ≥ 6 символов, displayName непустой
2. Проверка уникальности username в БД
3. Хеширование пароля SHA-256
4. Вставка пользователя в таблицу `users`
5. Генерация токена, сохранение в `sessions`
6. Установка cookie `token` (httponly, SameSite=Lax)
7. Возврат: `{ user: { id, username, displayName }, token }`

---

**`POST /api/auth/login`**

Входные данные: `{ username, password }`

Логика:
1. Валидация полей
2. Поиск пользователя по username
3. Сравнение хеша пароля: `row[2] != hash_password(password)`
4. Обновление флага `is_online = TRUE`
5. Генерация нового токена
6. Возврат: `{ user: { id, username, displayName, avatarUrl }, token }`

---

**`POST /api/auth/logout`** _(требует auth)_

1. Удаление токена из `sessions`
2. Установка `is_online = FALSE` в БД
3. Удаление cookie `token`
4. Возврат: `{ success: true }`

---

**`GET /api/auth/me`** _(требует auth)_

Возвращает профиль текущего пользователя из БД по `request.user_id`.

---

**`GET /api/chats`** _(требует auth)_

Сложный запрос, выполняющий для каждого чата пользователя:
1. Получение списка `chat_id` из `chat_participants`
2. Выборка данных чата
3. JOIN с `users` для получения участников (имя, аватар, онлайн-статус)
4. Запрос последнего сообщения (JOIN с `users` для данных отправителя)
5. Подсчёт непрочитанных сообщений (не от текущего пользователя)

Возвращает массив чатов, отсортированных по `updated_at DESC` (последняя активность первой).

---

**`POST /api/chats`** _(требует auth)_

Входные данные: `{ participantIds: string[], isGroup?: boolean, name?: string }`

1. Создание записи в `chats`
2. Вставка всех участников (включая создателя) в `chat_participants`
3. Возврат полных данных созданного чата

---

**`DELETE /api/chats/<chat_id>`** _(требует auth)_

1. Проверка, что текущий пользователь является участником чата
2. Удаление чата (каскадное удаление через `ON DELETE CASCADE`)

---

**`GET /api/chats/<chat_id>/messages`** _(требует auth)_

Параметр: `?limit=50` (по умолчанию 50)

JOIN сообщений с данными отправителя. Запрос выбирает `LIMIT` последних сообщений (`ORDER BY created_at DESC`), затем разворачивает их в хронологическом порядке (`reversed(rows)`) для правильного отображения на клиенте.

---

**`POST /api/chats/<chat_id>/messages`** _(требует auth)_

Входные данные: `{ content: string, encryptedContent?: string }`

1. Валидация: content непустой
2. Вставка сообщения в `messages`
3. Обновление `updated_at` в `chats` (для сортировки чатов)
4. Получение данных отправителя
5. Отправка нового сообщения через WebSocket всем остальным участникам (`broadcast_to_chat`)
6. Возврат полных данных сообщения

---

**`POST /api/chats/<chat_id>/read`** _(требует auth)_

Отмечает все непрочитанные сообщения в чате как прочитанные, кроме собственных сообщений текущего пользователя:
```sql
UPDATE messages SET is_read = TRUE
WHERE chat_id = %s AND sender_id != %s AND is_read = FALSE
```

---

**`GET /api/users/search`** _(требует auth)_

Параметр: `?q=поисковый_запрос`

Ищет пользователей по `username` или `display_name` с помощью `ILIKE` (регистронезависимый поиск):
```sql
SELECT ... FROM users
WHERE (username ILIKE %q% OR display_name ILIKE %q%)
AND id != %current_user_id%
LIMIT 20
```
Исключает текущего пользователя из результатов.

---

**`WebSocket /ws`**

```python
@sock.route("/ws")
def ws(ws):
    token = request.args.get("token")
    ...
    ws_clients[user_id] = ws
    while True:
        data = ws.receive()
        ...
```

Клиент подключается, передав токен в query-параметре: `wss://host/ws?token=<token>`. Сервер регистрирует клиента в `ws_clients`. Входящие сообщения обрабатываются в цикле. При отключении клиент удаляется из словаря.

---

## 3. Клиентская часть (Frontend)

### 3.1 Точка входа

#### `client/index.js`

```js
import { registerRootComponent } from "expo";
import App from "@/App";
registerRootComponent(App);
```

Единственная точка входа. `registerRootComponent` — это замена стандартного `AppRegistry.registerComponent` из React Native, которая также настраивает Expo-специфичные обёртки (SafeAreaView, загрузку шрифтов и т.д.).

---

#### `client/App.tsx`

Корневой компонент. Выстраивает дерево провайдеров в строго определённом порядке (каждый следующий имеет доступ к предыдущему):

```
ErrorBoundary                  — перехватывает краши
  └─ QueryClientProvider        — TanStack Query (кэш HTTP-запросов)
      └─ AuthProvider           — контекст аутентификации
          └─ SafeAreaProvider   — безопасные отступы (notch, home indicator)
              └─ GestureHandlerRootView — жесты (Reanimated)
                  └─ KeyboardProvider  — управление клавиатурой
                      └─ NavigationContainer — React Navigation
                          └─ RootStackNavigator
                          └─ StatusBar
```

**Порядок важен:** `AuthProvider` должен быть внутри `QueryClientProvider`, чтобы использовать `apiRequest`. `SafeAreaProvider` должен быть снаружи всех экранов. `GestureHandlerRootView` должен быть корневым для `Gesture.*` из Reanimated.

---

### 3.2 Провайдеры и контекст

#### `client/lib/auth-context.tsx`

Реализует глобальный контекст аутентификации через React Context API.

**Состояние:**
- `user: User | null` — данные текущего пользователя
- `isLoading: boolean` — идёт ли загрузка (проверка сохранённого токена)

**AsyncStorage ключи:**
- `@messenger_auth_token` — JWT-подобный токен
- `@messenger_user` — сериализованный объект пользователя

**Метод `loadStoredAuth()`:**
Вызывается при монтировании. Параллельно читает токен и пользователя из AsyncStorage. Если оба есть — устанавливает пользователя из кэша (для мгновенного UI), затем делает запрос `GET /api/auth/me` для верификации токена. Если сервер возвращает ошибку — очищает хранилище и разлогинивает.

**Метод `login(username, password)`:**
Вызывает `POST /api/auth/login`, сохраняет токен и пользователя в AsyncStorage, устанавливает состояние.

**Метод `register(username, password, displayName)`:**
Аналогично login, но вызывает `POST /api/auth/register`.

**Метод `logout()`:**
Вызывает `POST /api/auth/logout` (даже при ошибке продолжает), очищает AsyncStorage, обнуляет состояние.

**Хук `useAuth()`:**
Возвращает `{ user, isLoading, isAuthenticated, login, register, logout, updateUser }`. Бросает ошибку, если используется вне `AuthProvider`.

---

#### `client/lib/query-client.ts`

Настройка TanStack Query для HTTP-коммуникации.

**`getApiUrl()`:**
Читает переменную окружения `EXPO_PUBLIC_DOMAIN` (которая инжектируется Expo при старте как `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN:5000`). Возвращает базовый URL API типа `https://xxx.replit.dev:5000`.

**`apiRequest(method, route, data?)`:**
```typescript
const url = new URL(route, baseUrl);
const res = await fetch(url, { method, headers, body, credentials: "include" });
```
Строит абсолютный URL, отправляет запрос с `credentials: "include"` (для передачи cookies). При ошибке (не 2xx) бросает исключение с телом ответа.

**`getQueryFn({ on401 })`:**
Фабрика функции запроса для TanStack Query. Принимает `queryKey` (массив строк), объединяет их в URL через `queryKey.join("/")`. Обрабатывает 401: либо возвращает `null`, либо бросает ошибку.

**`queryClient`:**
Создаётся с настройками:
- `staleTime: Infinity` — данные не устаревают автоматически (нет фонового рефетча)
- `refetchInterval: false` — нет автоматического обновления
- `refetchOnWindowFocus: false` — нет обновления при фокусе
- `retry: false` — нет повтора при ошибке

---

#### `client/lib/encryption.ts`

Реализует симметричное шифрование сообщений на клиенте.

**Алгоритм XOR + Base64:**
```
Сообщение → посимвольный XOR с ключом → Base64 (btoa) → зашифрованная строка
```

Ключ: `"messenger_secret_key_2024"` (статическая строка, встроена в код).

Цикл XOR: каждый символ сообщения XOR-ится с символом ключа по модулю длины ключа (`i % key.length`), что даёт цикличность.

Обработка Unicode: используется `btoa(unescape(encodeURIComponent(result)))` для корректной обработки не-ASCII символов.

**Функции:**
- `encryptMessage(message)` — шифрует строку
- `decryptMessage(encryptedMessage)` — расшифровывает строку
- `generateMessageHash(message)` — генерирует простой числовой хеш (djb2-подобный алгоритм) для верификации

**Важно:** Это симметричное шифрование с предустановленным ключом — оно защищает от простого просмотра данных в БД, но не является настоящим end-to-end шифрованием. Ключ одинаков для всех пользователей.

---

### 3.3 Навигация

Используется **React Navigation 7** с нативным стек-навигатором.

#### Структура навигации

```
RootStackNavigator (createNativeStackNavigator)
├── [если не аутентифицирован] Auth → AuthScreen
│                                      ├── LoginScreen
│                                      └── RegisterScreen
└── [если аутентифицирован] Main → MainTabNavigator (createBottomTabNavigator)
    ├── HomeTab → HomeStackNavigator
    │              └── Home → HomeScreen
    │                          └── ChatListScreen (список чатов)
    │                          └── ChatScreen (открытый чат — рендерится поверх)
    └── ProfileTab → ProfileStackNavigator
                     └── Profile → ProfileScreen
```

#### `client/navigation/RootStackNavigator.tsx`

Главный роутер. Определяет какой экран показывать в зависимости от `isAuthenticated` из `useAuth()`.

При `isLoading === true` показывает спиннер вместо навигатора (пока проверяется сохранённый токен).

#### `client/navigation/MainTabNavigator.tsx`

Нижняя панель с двумя вкладками:
- **Chats** (`HomeTab`) — иконка `message-circle` из Feather
- **Profile** (`ProfileTab`) — иконка `user` из Feather

**iOS:** TabBar использует `BlurView` (frosted glass эффект) с `intensity=100`.

**Android:** Непрозрачный фон цвета `theme.backgroundRoot`.

#### `client/navigation/HomeStackNavigator.tsx`

Стек для вкладки Chats. Содержит один экран `Home` (компонент `HomeScreen`). В заголовке — кастомный `HeaderTitle` с логотипом и названием приложения.

#### `client/navigation/ProfileStackNavigator.tsx`

Стек для вкладки Profile. Содержит один экран `Profile` со стандартным заголовком.

#### `client/hooks/useScreenOptions.ts`

Хук, возвращающий стандартные настройки навигатора. Ключевые настройки:

- `headerTransparent: true` — прозрачный заголовок с blur-эффектом
- `headerBlurEffect: "dark" | "light"` — цветовая схема blur (по теме)
- `headerTintColor: theme.text` — цвет кнопок и текста заголовка
- `gestureEnabled: true` — свайп назад
- `fullScreenGestureEnabled` — зависит от доступности Liquid Glass (iOS 26+)
- На Android/Web — непрозрачный фон `theme.backgroundRoot`

---

### 3.4 Экраны (Screens)

#### `client/screens/AuthScreen.tsx`

Простой переключатель между двумя экранами аутентификации. Хранит локальный стейт `isLogin: boolean`. Передаёт коллбэки для переключения в дочерние экраны.

---

#### `client/screens/LoginScreen.tsx`

**Состояние:** `username`, `password`, `isLoading`, `error`

**Логика:**
1. Валидация: оба поля непустые
2. Вызов `login(username, password)` из `AuthContext`
3. Успех → `Haptics.NotificationFeedbackType.Success` + автоматический переход (через изменение `isAuthenticated`)
4. Ошибка → показ текста ошибки + `Haptics.NotificationFeedbackType.Error`

**UI:** Логотип → заголовок → поля → кнопка Sign In → ссылка на регистрацию

Учёт безопасной зоны: `paddingTop: insets.top + Spacing["3xl"]`

---

#### `client/screens/RegisterScreen.tsx`

**Состояние:** `displayName`, `username`, `password`, `confirmPassword`, `isLoading`, `error`

**Валидация на клиенте:**
- Все поля заполнены
- Пароли совпадают
- password ≥ 6 символов
- username ≥ 3 символов

Использует `ScrollView` (а не обычный `View`) для корректной прокрутки при появлении клавиатуры на маленьких экранах.

---

#### `client/screens/HomeScreen.tsx`

Обёртка-маршрутизатор для домашнего экрана. Хранит `selectedChat` (или `null`). Рендерит либо `ChatListScreen`, либо `ChatScreen` в зависимости от выбора.

---

#### `client/screens/ChatListScreen.tsx`

Наиболее сложный экран. Основной экран приложения.

**TanStack Query:**
```typescript
useQuery({ queryKey: ["/api/chats"], refetchInterval: 5000 })
```
Список чатов обновляется каждые 5 секунд (polling).

**Поиск пользователей:**
```typescript
useQuery({
  queryKey: ["/api/users/search", searchQuery],
  queryFn: async () => { ... url.searchParams.set("q", searchQuery) ... },
  enabled: searchQuery.length >= 2,
})
```
Запрос выполняется только при длине поискового запроса ≥ 2 символа. URL строится вручную с параметром `?q=` (не через массив ключей, чтобы избежать join-артефактов).

**Мутации:**
- `createChatMutation` — POST /api/chats → инвалидирует кэш чатов → переходит в новый чат
- `deleteChatMutation` — DELETE /api/chats/:id → инвалидирует кэш → хаптик успеха

**Форматирование времени (`formatTimestamp`):**
- Сегодня → `"14:32"`
- Вчера → `"Yesterday"`
- До 7 дней → `"Mon"`, `"Tue"` и т.д.
- Старше → `"Jan 5"`

**UI элементы:**
- FlatList с RefreshControl (pull-to-refresh)
- FAB (кнопка создания чата) — фиксирована поверх списка
- Modal выбора/создания чата — sheet-стиль (`presentationStyle="pageSheet"`)
- Modal подтверждения удаления — центрированное модальное окно

**Долгое нажатие** на чат вызывает `Haptics.ImpactFeedbackStyle.Medium` и открывает диалог удаления.

---

#### `client/screens/ChatScreen.tsx`

Экран переписки.

**Polling:** `refetchInterval: 3000` — сообщения обновляются каждые 3 секунды.

**Оптимистичное обновление (`onMutate`):**
```typescript
onMutate: async (content) => {
  await queryClient.cancelQueries(...)
  const previousMessages = queryClient.getQueryData(...)
  
  const optimisticMessage = { id: `temp-${Date.now()}`, content, ... }
  queryClient.setQueryData(..., (old) => [...old, optimisticMessage])
  
  return { previousMessages }
}
```
Сообщение мгновенно добавляется в UI. При ошибке (`onError`) кэш откатывается к предыдущему состоянию. При успехе — инвалидируется кэш для получения реальных данных.

**Отметка прочитанного:** `useEffect` с зависимостью `[chatId, messages.length]` — при каждом новом сообщении вызывается `POST /api/chats/:chatId/read`.

**Инвертированный FlatList:**
```typescript
data={messages.length > 0 ? [...messages].reverse() : []}
inverted={messages.length > 0}
```
FlatList перевёрнут (новые сообщения внизу), данные реверсированы. При пустом списке инверсия отключена, чтобы EmptyState рендерился нормально.

**Keyboard handling:** `KeyboardAvoidingView` из `react-native-keyboard-controller` с `behavior="padding"` и `keyboardVerticalOffset={0}`.

---

#### `client/screens/ProfileScreen.tsx`

Экран профиля пользователя.

**Отображает:**
- Аватар (`Avatar` компонент)
- Имя и username
- Карточка с меню настроек
- Кнопка выхода

**Меню:** 5 пунктов (Notifications, Privacy, Appearance, Help, About). Каждый открывает модальное окно с информационным сообщением.

**`showModal(title, message)`:** Устанавливает контент модала и делает его видимым.

**Логаут:** Вызывает `logout()` из `AuthContext` + `Haptics.ImpactFeedbackStyle.Medium`.

Учёт отступов: `paddingTop: headerHeight`, `paddingBottom: tabBarHeight` для корректного отображения с прозрачным хедером и таб-баром.

---

#### `client/screens/ModalScreen.tsx`

Пустой экран-шаблон для модальных переходов. Содержит только ScrollView с правильными отступами. Может быть расширен в будущем.

---

### 3.5 Компоненты (Components)

#### `client/components/ErrorBoundary.tsx`

React class-компонент (единственный в проекте — React Error Boundaries требуют class-компоненты).

**Методы:**
- `getDerivedStateFromError(error)` — статический метод, вызывается при рендер-ошибке, устанавливает `state.error`
- `componentDidCatch(error, info)` — вызывает `onError` пропс (если задан) для логирования
- `resetError()` — сбрасывает ошибку (устанавливает `error: null`)

При ошибке рендерит `ErrorFallback` (или кастомный `FallbackComponent`). В нормальном состоянии рендерит `children`.

---

#### `client/components/ErrorFallback.tsx`

Экран аварийного восстановления.

**Режим DEV:** Показывает кнопку-иконку (bug) в правом верхнем углу. При нажатии открывает модальное окно со stack trace в monospace-шрифте (текст выделяемый — `selectable`).

**Кнопка "Try Again":**
```typescript
const handleRestart = async () => {
  await reloadAppAsync();  // из пакета expo
};
```
`reloadAppAsync()` полностью перезагружает JS-бандл, что сбрасывает всё состояние приложения.

---

#### `client/components/Avatar.tsx`

Универсальный компонент аватара.

**Размеры:**
- `small` → 40px (в ChatHeader)
- `medium` → 48px (в списке чатов)
- `large` → 56px (в профиле)

**Рендеринг:**
- Если `uri` задан → `expo-image` с `contentFit="cover"` и анимацией появления 200мс
- Если `uri` не задан → цветной круг с иконкой `user` из Feather

**Индикатор онлайна:** При `showOnlineStatus=true` рендерит маленький круг в правом нижнем углу. Зелёный (online) или серый (offline). Размер зависит от общего размера аватара.

---

#### `client/components/Button.tsx`

Кнопка с анимацией нажатия.

**Анимация:**
```typescript
scale = useSharedValue(1)
// onPressIn:
scale.value = withSpring(0.98, springConfig)
// onPressOut:
scale.value = withSpring(1, springConfig)
```
Пружинная анимация: масштаб 98% при нажатии. Параметры пружины: `damping=15, mass=0.3, stiffness=150`.

Использует `Animated.createAnimatedComponent(Pressable)` для нативной анимации.

При `disabled=true`: непрозрачность 50%, нажатие игнорируется.

---

#### `client/components/Card.tsx`

Карточка-контейнер с опциональной анимацией нажатия.

**Система elevation:**
| `elevation` | Цвет фона |
|---|---|
| 0 | `backgroundRoot` |
| 1 | `backgroundDefault` |
| 2 | `backgroundSecondary` |
| 3 | `backgroundTertiary` |

Не использует CSS `box-shadow` (устаревший в React Native), только цвет фона для имитации глубины.

---

#### `client/components/ChatHeader.tsx`

Заголовок экрана переписки (кастомный, не через Navigation).

**Расположение:** `position: "absolute"`, `zIndex: 100` — плавает поверх FlatList.

**Blur:** `BlurView` с `intensity=80` — frosted glass эффект. На Android `BlurView` может рендериться без эффекта (ограничение платформы).

**Элементы:** кнопка назад → аватар + имя + онлайн-статус → иконки телефона и меню.

**Отступ от нотча:** `paddingTop: insets.top`

---

#### `client/components/ChatListItem.tsx`

Строка в списке чатов.

**Анимация нажатия:** Аналогично `Button` — пружинный scale + смена фона.

```typescript
scale = useSharedValue(1)
backgroundColor = useSharedValue(0)  // 0=transparent, 1=backgroundDefault
```

**Структура:**
```
[Avatar] [name + timestamp  ]
         [lastMessage + badge]
```

**Бейдж непрочитанных:** Показывается при `unreadCount > 0`. Текст `"99+"` при количестве > 99.

---

#### `client/components/MessageBubble.tsx`

Пузырёк сообщения в переписке.

**Тип сообщения:**
- Исходящее (`isSent=true`) → выравнивание вправо, `alignSelf: "flex-end"`, фон `theme.messageSent` (#DCF8C6 в светлой теме)
- Входящее (`isSent=false`) → выравнивание влево, `alignSelf: "flex-start"`, фон `theme.messageReceived` (#FFFFFF)

**Группировка:** При `isFirstInGroup=false` один из углов скругляется меньше, создавая эффект "цепочки" сообщений от одного отправителя.

**Анимация появления:**
```typescript
entering={FadeInUp.delay(index * 30).duration(200)}
```
Каждое сообщение появляется с задержкой `index * 30ms` — эффект последовательного появления.

---

#### `client/components/MessageInput.tsx`

Поле ввода сообщения.

**Анимация кнопки отправки:** Пружинный scale до 0.9 при нажатии.

**Кнопка отправки:** Меняет цвет (`theme.primary` vs `theme.surfaceDark`) и цвет иконки в зависимости от `canSend`.

**MultiLine:** TextInput расширяется до 4 строк, после чего появляется скролл.

**Отступ снизу:** `paddingBottom: Math.max(insets.bottom, Spacing.sm)` — учитывает home indicator iPhone.

---

#### `client/components/EmptyState.tsx`

Экран пустого состояния (нет чатов, нет сообщений, нет результатов поиска).

**Пропсы:**
- `title` — заголовок
- `description?` — подзаголовок
- `actionLabel?` + `onAction?` — опциональная кнопка
- `showImage?` (default: `true`) — показывать ли иллюстрацию `assets/images/empty-chats.png`

---

#### `client/components/LoadingState.tsx`

Компонент загрузки с `ActivityIndicator` и опциональным текстом.

---

#### `client/components/HeaderTitle.tsx`

Кастомный заголовок для навигатора. Отображает логотип (`assets/images/icon.png`) и название приложения в одной строке.

---

#### `client/components/ThemedText.tsx`

Типографический компонент. Принимает `type` из предустановленных стилей (`h1`–`h4`, `body`, `small`, `link` и т.д.) и автоматически применяет цвет `theme.text`.

---

#### `client/components/ThemedView.tsx`

Контейнер с автоматическим фоном `theme.backgroundRoot`.

---

#### `client/components/KeyboardAwareScrollViewCompat.tsx`

Обёртка над `KeyboardAwareScrollView` из `react-native-keyboard-controller`. Обеспечивает корректный отступ при появлении клавиатуры в формах (Login, Register, Profile).

---

#### `client/components/Spacer.tsx`

Простой компонент для добавления вертикального или горизонтального пространства.

---

### 3.6 Хуки (Hooks)

#### `client/hooks/useTheme.ts`

```typescript
const colorScheme = useColorScheme();  // "light" | "dark"
const theme = Colors[colorScheme ?? "light"];
return { theme, isDark };
```

Оборачивает системную цветовую схему и возвращает объект цветов из `constants/theme.ts`.

---

#### `client/hooks/useColorScheme.ts` / `useColorScheme.web.ts`

Платформо-специфичный хук для определения светлой/тёмной темы. Версия `.web.ts` используется в браузере через Metro-резолвер (расширение `.web.ts` имеет приоритет).

---

#### `client/hooks/useScreenOptions.ts`

Возвращает стандартные опции для `Stack.Navigator`. Использует `isLiquidGlassAvailable()` из `expo-glass-effect` для определения, доступен ли iOS 26 Liquid Glass API — если да, `fullScreenGestureEnabled=false` (чтобы не конфликтовать с системными жестами).

---

### 3.7 Библиотеки (Lib)

Описаны выше в разделе 3.2.

---

### 3.8 Константы (Constants)

#### `client/constants/theme.ts`

Единый источник истины для всех визуальных токенов.

**`MessengerColors`** — базовая палитра:
- `primary: "#128C7E"` — основной зелёный (WhatsApp-style)
- `accent: "#25D366"` — акцентный зелёный
- `messageSent: "#DCF8C6"` — фон исходящего сообщения

**`Colors`** — темы (`light` и `dark`), каждая содержит ~20 цветовых токенов.

**`Spacing`** — размеры отступов (4px–48px) + специфичные размеры (`inputHeight=48`, `buttonHeight=52`, `avatarSmall=40`, `avatarMedium=48`, `avatarLarge=56`).

**`BorderRadius`** — скругления от `xs=8` до `full=9999`.

**`Typography`** — предопределённые стили текста: `h1`–`h4`, `body`, `small`, `link`, `chatName`, `chatPreview`, `timestamp`, `message`.

**`Fonts`** — платформо-специфичные семейства шрифтов (system-ui на iOS, normal на Android, web-стек на web).

**`Shadows`** — три уровня теней (`small`, `medium`, `large`) — определены, но не применяются (используется цвет для имитации elevation).

---

## 4. База данных

### Схема

```sql
-- Пользователи
CREATE TABLE users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username TEXT NOT NULL UNIQUE,        -- логин (мин. 3 символа)
    password TEXT NOT NULL,               -- SHA-256 хеш
    display_name TEXT NOT NULL,           -- отображаемое имя
    avatar_url TEXT,                      -- URL аватара (nullable)
    is_online BOOLEAN DEFAULT FALSE,      -- онлайн-статус
    last_seen TIMESTAMP DEFAULT NOW(),    -- последний вход
    created_at TIMESTAMP DEFAULT NOW()    -- дата регистрации
);

-- Чаты
CREATE TABLE chats (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT,                            -- название (для групповых)
    is_group BOOLEAN DEFAULT FALSE,       -- групповой чат?
    avatar_url TEXT,                      -- аватар чата
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()    -- обновляется при новом сообщении
);

-- Участники чатов (M:M связь users ↔ chats)
CREATE TABLE chat_participants (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    chat_id VARCHAR NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT NOW()
);
-- Индексы: chat_participants_chat_id_idx, chat_participants_user_id_idx

-- Сообщения
CREATE TABLE messages (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    chat_id VARCHAR NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,                -- открытый текст
    encrypted_content TEXT,              -- зашифрованный текст (XOR+Base64)
    is_read BOOLEAN DEFAULT FALSE,        -- прочитано ли
    created_at TIMESTAMP DEFAULT NOW()
);
-- Индексы: messages_chat_id_idx, messages_sender_id_idx
```

### Каскадное удаление

При удалении чата (`DELETE FROM chats WHERE id = ...`):
- Автоматически удаляются все `chat_participants` этого чата
- Автоматически удаляются все `messages` этого чата

При удалении пользователя (не реализовано в API, но в схеме):
- Удаляются его участия в чатах
- Удаляются его сообщения

---

## 5. Жизненный цикл запроса

### Отправка сообщения

```
[Пользователь нажимает Send]
    ↓
MessageInput.handleSend()
    ↓ очищает поле ввода
ChatScreen.handleSend(content)
    ↓
sendMessageMutation.mutate(content)
    ↓ onMutate:
    │   ├── cancelQueries (отменяет активные запросы)
    │   ├── getQueryData (сохраняет текущие сообщения)
    │   ├── setQueryData (добавляет optimistic message)
    │   └── return { previousMessages }
    ↓
encryptMessage(content) → encryptedContent
    ↓
apiRequest("POST", "/api/chats/:id/messages", { content, encryptedContent })
    ↓ HTTP запрос к Flask
    ↓
Flask: INSERT INTO messages → UPDATE chats.updated_at → broadcast_to_chat(ws)
    ↓ onSuccess:
    ├── invalidateQueries(["/api/chats", chatId, "messages"]) → рефетч
    └── invalidateQueries(["/api/chats"]) → обновление списка чатов
```

---

## 6. Шифрование сообщений

```
Текст:      "Привет!"
              ↓ XOR с ключом "messenger_secret_key_2024"
Бинарный:   [0xC2, 0xB5, ...]
              ↓ encodeURIComponent → unescape → btoa
Base64:     "wYTOsA=="
              ↓ сохраняется в encrypted_content
```

Оба поля (`content` и `encrypted_content`) хранятся в БД. Клиент всегда читает `content` (незашифрованный), `encrypted_content` — резерв для будущего расширения.

---

## 7. Аутентификация

```
Регистрация/Вход
    ↓
Flask генерирует token = secrets.token_hex(32)
    ↓
sessions[token] = user_id  (в памяти сервера)
    ↓ ответ клиенту:
    ├── JSON: { user, token }
    └── Set-Cookie: token=<token>; httponly; SameSite=Lax

Клиент сохраняет:
    ├── AsyncStorage["@messenger_auth_token"] = token
    └── AsyncStorage["@messenger_user"] = JSON.stringify(user)

Последующие запросы:
    Headers: Authorization: Bearer <token>
    (или Cookie: token=<token>)

Проверка (@auth_required):
    token in sessions → request.user_id = sessions[token]
```

**Слабые стороны текущей реализации:**
- `sessions` — в памяти, теряется при рестарте сервера
- SHA-256 без соли (одинаковые пароли дают одинаковый хеш)
- Ключ шифрования встроен в код

---

## 8. Реальное время (WebSocket)

**Текущий механизм (polling):**
- `ChatListScreen` — `refetchInterval: 5000` (каждые 5 сек)
- `ChatScreen` — `refetchInterval: 3000` (каждые 3 сек)

**WebSocket (сервер готов, клиент использует polling):**

Сервер регистрирует маршрут `/ws` через `flask-sock`. При получении нового сообщения вызывается `broadcast_to_chat()`, который рассылает JSON-payload всем участникам чата через открытые WS-соединения.

Клиент пока не использует WebSocket для получения — вместо этого регулярно опрашивает REST API. WebSocket-архитектура готова к подключению.

---

*Документ актуален на апрель 2026. Версия приложения: 1.0.0*
