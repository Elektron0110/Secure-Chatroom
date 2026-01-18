# Messenger App Design Guidelines

## Brand Identity
**Purpose**: A secure, cross-platform messenger for real-time communication with focus on simplicity and privacy.

**Aesthetic Direction**: Clean, modern messaging interface with emphasis on readability and comfortable long-form conversations. Professional yet approachable.

**Memorable Element**: Distinctive dual-panel layout with elegant separation between chat list and conversation view. Subtle online/offline status indicators with smooth transitions.

## Navigation Architecture
**Layout Type**: Dual-panel desktop/mobile adaptive layout

**Screen Structure**:
- **Left Panel**: Chat list (always visible on desktop, drawer on mobile)
- **Right Panel**: Active conversation view (full screen on mobile)
- **Auth Flow**: Login → Registration → Main messenger view

## Screen-by-Screen Specifications

### Authentication Screen
**Purpose**: Secure user login/registration
**Layout**:
- Centered form with app logo at top
- Email/password fields with validation
- "Login" and "Register" toggle
- Submit button below form
**Components**: Text inputs, primary button, logo image

### Main Messenger View

#### Left Panel - Chat List
**Purpose**: Display all user conversations
**Layout**:
- Header strip (60px height):
  - App logo (40x40px) + app name in bold
  - Background: Primary color
- Scrollable chat list below header
**Chat List Items**:
- Avatar (48x48px circle) on left
- Chat name (bold, 16px)
- Last message preview (gray, 14px, truncated)
- Timestamp (gray, 12px, right-aligned)
- Unread indicator (small badge on avatar)
**Actions**: Click/tap to select chat, long-press for delete option

#### Right Panel - Conversation View

**Top Section - Chat Header** (60px):
- Avatar (40x40px circle)
- Contact name (bold, 18px)
- Online/offline status (dot indicator + text)
- Background: Surface color

**Middle Section - Message History**:
- Scrollable message list
- Sent messages (right-aligned, primary color background)
- Received messages (left-aligned, surface color background)
- Message bubbles: rounded corners (12px), padding (12px), max-width 70%
- Timestamp below each message (gray, 10px)

**Bottom Section - Input Area** (80px):
- Text input field (multiline support)
- Send button (icon, primary color)
- Layout: horizontal flex

## Color Palette
- **Primary**: #128C7E (messenger green - trustworthy, calm)
- **Primary Dark**: #075E54 (headers, active states)
- **Accent**: #25D366 (online status, success actions)
- **Surface**: #F7F7F7 (received messages, backgrounds)
- **Surface Dark**: #E5E5E5 (borders, separators)
- **Text Primary**: #2C2C2C
- **Text Secondary**: #6B6B6B
- **Error**: #DC3545 (offline, errors)
- **Background**: #FFFFFF

## Typography
- **Font Family**: Roboto (cross-platform, highly readable)
- **Sizes**:
  - App name: 20px, Bold
  - Chat name: 16px, Bold
  - Message text: 14px, Regular
  - Timestamp: 10px, Regular
  - Last message preview: 14px, Regular
  - Status text: 12px, Regular

## Visual Design
- **Borders**: 1px solid Surface Dark for panel separation
- **Shadows**: Subtle elevation for chat header (0px 2px 4px rgba(0,0,0,0.1))
- **Icons**: Material Icons or similar system icons
- **Touch Feedback**: Subtle background color change on hover/press (#F0F0F0)
- **Transitions**: 200ms ease for status changes, message animations

## Assets to Generate

### Required Assets:
1. **app-logo.png** (256x256px)
   - Simple messenger icon (speech bubble or letter)
   - Used in: Left panel header, auth screen, app icon
   
2. **default-avatar.png** (96x96px)
   - Neutral user silhouette on primary color background
   - Used in: Chat list items, chat header (when no custom avatar)

3. **empty-chats.png** (200x200px)
   - Illustration of empty inbox/conversation bubbles
   - Used in: Left panel when no chats exist

4. **send-icon.svg**
   - Simple paper plane or arrow icon
   - Used in: Send button in input area

5. **online-indicator.svg**
   - Small green dot (12x12px)
   - Used in: Chat header, chat list items

## Responsive Behavior
- **Desktop (>768px)**: Dual-panel side-by-side
- **Mobile (<768px)**: Single panel, chat list as drawer, conversation full-screen
- **Chat list width**: 320px fixed on desktop, full-width on mobile
- **Touch targets**: Minimum 44x44px for mobile interactions

## State Indicators
- **Unread messages**: Badge with count on avatar
- **Online status**: Green dot + "Online" text
- **Offline status**: Gray dot + "Last seen..." text
- **Sending message**: Loading spinner on send button
- **Connection error**: Red banner at top with retry option