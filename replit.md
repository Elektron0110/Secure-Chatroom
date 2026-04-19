# Messenger App

A cross-platform messenger application built with React Native (Expo) frontend and Python (Flask) backend.

## Overview

A real-time messaging application with:
- User authentication (login/registration)
- Private chats between users
- Real-time messaging with WebSocket support
- Message encryption
- Online/offline status indicators
- Modern UI with liquid glass effects

## Tech Stack

### Frontend
- React Native with Expo
- React Navigation for routing
- TanStack Query for data fetching
- React Native Reanimated for animations
- Expo Haptics for haptic feedback

### Backend
- Python 3.11 with Flask
- PostgreSQL with psycopg2
- Flask-Sock for WebSocket support
- Session-based authentication (in-memory token store)

## Project Structure

```
client/
├── App.tsx                 # Main app component with providers
├── components/             # Reusable UI components
│   ├── Avatar.tsx          # User avatar with online status
│   ├── Button.tsx          # Animated button
│   ├── Card.tsx            # Card component
│   ├── ChatHeader.tsx      # Chat screen header
│   ├── ChatListItem.tsx    # Chat list item
│   ├── EmptyState.tsx      # Empty state component
│   ├── ErrorBoundary.tsx   # App crash boundary
│   ├── HeaderTitle.tsx     # App header with logo
│   ├── LoadingState.tsx    # Loading indicator
│   ├── MessageBubble.tsx   # Message bubble
│   └── MessageInput.tsx    # Message input field
├── constants/
│   └── theme.ts            # Colors, spacing, typography
├── hooks/
│   ├── useColorScheme.ts   # Color scheme hook
│   ├── useScreenOptions.ts # Navigation screen options
│   └── useTheme.ts         # Theme hook
├── lib/
│   ├── auth-context.tsx    # Authentication context
│   ├── encryption.ts       # Message encryption
│   └── query-client.ts     # API client
├── navigation/
│   ├── HomeStackNavigator.tsx
│   ├── MainTabNavigator.tsx
│   ├── ProfileStackNavigator.tsx
│   └── RootStackNavigator.tsx
└── screens/
    ├── AuthScreen.tsx      # Auth wrapper
    ├── ChatListScreen.tsx  # Chat list
    ├── ChatScreen.tsx      # Chat conversation
    ├── HomeScreen.tsx      # Home wrapper
    ├── LoginScreen.tsx     # Login form
    ├── ModalScreen.tsx     # Info modals (profile settings)
    ├── ProfileScreen.tsx   # User profile
    └── RegisterScreen.tsx  # Registration form

server/
├── app.py                  # Python Flask backend (all routes, DB, WebSocket)
├── index.ts                # Launcher that spawns Python server as child process
└── templates/
    └── landing-page.html   # QR code landing page
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Chats
- `GET /api/chats` - Get user's chats
- `POST /api/chats` - Create new chat
- `DELETE /api/chats/:chatId` - Delete chat

### Messages
- `GET /api/chats/:chatId/messages` - Get chat messages
- `POST /api/chats/:chatId/messages` - Send message
- `POST /api/chats/:chatId/read` - Mark messages as read

### Users
- `GET /api/users/search?q=query` - Search users

## Database Schema

### Users
- id (UUID, primary key)
- username (unique)
- password (hashed with SHA-256)
- display_name
- avatar_url
- is_online
- last_seen

### Chats
- id (UUID, primary key)
- name (optional, for group chats)
- is_group
- avatar_url
- created_at, updated_at

### Chat Participants
- id (UUID, primary key)
- chat_id (FK → chats)
- user_id (FK → users)
- joined_at

### Messages
- id (UUID, primary key)
- chat_id (FK → chats)
- sender_id (FK → users)
- content
- encrypted_content
- is_read
- created_at

## Running the App

### Development
1. Python Flask backend runs on port 5000 (`server/app.py`)
2. Expo dev server runs on port 8081
3. Scan QR code with Expo Go to test on device

### Commands
- `npm run server:dev` - Start Python backend (via index.ts subprocess launcher)
- `npm run expo:dev` - Start Expo dev server

## Architecture Notes

- The workflow runs `npm run server:dev` → `tsx server/index.ts` → spawns `python server/app.py`
- Auth uses an in-memory token store (`sessions = {}` dict in app.py)
- WebSocket clients tracked in `ws_clients = {}` dict in app.py
- Database tables are created automatically on startup via `init_db()` in app.py
- Password hashing: SHA-256
- Message encryption: XOR + Base64

## Features

### Implemented
- User registration and login
- Chat list with last message preview
- Real-time messaging via WebSocket
- Message encryption (XOR + Base64)
- Online/offline status
- Unread message badges
- Create new chats
- Delete chats
- Pull-to-refresh
- Haptic feedback
- Dark mode support
- Profile settings modals (Notifications, Privacy, Appearance, Help, About)

### Design
- Messenger-style green theme (#128C7E)
- Frosted glass navigation
- Smooth animations
- Responsive layout
- iOS 26 liquid glass aesthetics
