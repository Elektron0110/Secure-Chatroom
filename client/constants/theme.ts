import { Platform } from "react-native";

export const MessengerColors = {
  primary: "#128C7E",
  primaryDark: "#075E54",
  accent: "#25D366",
  surface: "#F7F7F7",
  surfaceDark: "#E5E5E5",
  textPrimary: "#2C2C2C",
  textSecondary: "#6B6B6B",
  error: "#DC3545",
  white: "#FFFFFF",
  online: "#25D366",
  offline: "#9E9E9E",
  messageSent: "#DCF8C6",
  messageReceived: "#FFFFFF",
  inputBackground: "#F0F0F0",
};

const tintColorLight = MessengerColors.primary;
const tintColorDark = MessengerColors.accent;

export const Colors = {
  light: {
    text: MessengerColors.textPrimary,
    textSecondary: MessengerColors.textSecondary,
    buttonText: "#FFFFFF",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    link: MessengerColors.primary,
    backgroundRoot: "#FFFFFF",
    backgroundDefault: "#F2F2F2",
    backgroundSecondary: "#E6E6E6",
    backgroundTertiary: "#D9D9D9",
    primary: MessengerColors.primary,
    primaryDark: MessengerColors.primaryDark,
    accent: MessengerColors.accent,
    surface: MessengerColors.surface,
    surfaceDark: MessengerColors.surfaceDark,
    error: MessengerColors.error,
    online: MessengerColors.online,
    offline: MessengerColors.offline,
    messageSent: MessengerColors.messageSent,
    messageReceived: MessengerColors.messageReceived,
    inputBackground: MessengerColors.inputBackground,
    border: "#E0E0E0",
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    link: MessengerColors.accent,
    backgroundRoot: "#1F2123",
    backgroundDefault: "#2A2C2E",
    backgroundSecondary: "#353739",
    backgroundTertiary: "#404244",
    primary: MessengerColors.primary,
    primaryDark: MessengerColors.primaryDark,
    accent: MessengerColors.accent,
    surface: "#2A2C2E",
    surfaceDark: "#353739",
    error: MessengerColors.error,
    online: MessengerColors.online,
    offline: "#6B6B6B",
    messageSent: "#005C4B",
    messageReceived: "#2A2C2E",
    inputBackground: "#2A2C2E",
    border: "#404244",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
  chatHeaderHeight: 60,
  inputAreaHeight: 80,
  avatarSmall: 40,
  avatarMedium: 48,
  avatarLarge: 56,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
  message: 16,
};

export const Typography = {
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  chatName: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600" as const,
  },
  chatPreview: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  timestamp: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
};
