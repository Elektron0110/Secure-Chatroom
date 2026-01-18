# Messenger App

A cross-platform messenger application built with React Native (Expo) and Express.js backend.

## Overview

This is a real-time messaging application with:
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
- Express.js
- PostgreSQL with Drizzle ORM
- WebSocket for real-time updates
- Session-based authentication

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
    ├── ProfileScreen.tsx   # User profile
    └── RegisterScreen.tsx  # Registration form

server/
├── db.ts                   # Database connection
├── index.ts                # Express server setup
├── routes.ts               # API routes
├── storage.ts              # Database storage layer
└── templates/
    └── landing-page.html   # QR code landing page

shared/
└── schema.ts               # Database schema and types
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
- `GET /api/users/search` - Search users

## Database Schema

### Users
- id (UUID)
- username (unique)
- password (hashed)
- displayName
- avatarUrl
- isOnline
- lastSeen

### Chats
- id (UUID)
- name (optional, for group chats)
- isGroup
- avatarUrl
- timestamps

### Chat Participants
- id (UUID)
- chatId (FK)
- userId (FK)
- joinedAt

### Messages
- id (UUID)
- chatId (FK)
- senderId (FK)
- content
- encryptedContent
- isRead
- createdAt

## Running the App

### Development
1. Backend runs on port 5000
2. Expo dev server runs on port 8081
3. Scan QR code with Expo Go to test on device

### Commands
- `npm run server:dev` - Start backend
- `npm run expo:dev` - Start Expo dev server
- `npm run db:push` - Push database schema

## Features

### Implemented
- User registration and login
- Chat list with last message preview
- Real-time messaging
- Message encryption (XOR + Base64)
- Online/offline status
- Unread message badges
- Create new chats
- Delete chats
- Pull-to-refresh
- Haptic feedback
- Dark mode support

### Design
- Messenger-style green theme (#128C7E)
- Frosted glass navigation
- Smooth animations
- Responsive layout
- iOS 26 liquid glass aesthetics
