import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Typography, Shadows } from "@/constants/theme";

interface ChatHeaderProps {
  name: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
  lastSeen?: string;
  onBackPress: () => void;
  onInfoPress?: () => void;
}

export function ChatHeader({
  name,
  avatarUrl,
  isOnline = false,
  lastSeen,
  onBackPress,
  onInfoPress,
}: ChatHeaderProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const statusText = isOnline 
    ? "Online" 
    : lastSeen 
      ? `Last seen ${lastSeen}` 
      : "Offline";

  return (
    <BlurView
      intensity={80}
      tint={isDark ? "dark" : "light"}
      style={[
        styles.container,
        { paddingTop: insets.top },
        Shadows.small,
      ]}
    >
      <View style={styles.content}>
        <Pressable 
          onPress={onBackPress} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        
        <Pressable 
          style={styles.info} 
          onPress={onInfoPress}
        >
          <Avatar 
            uri={avatarUrl} 
            size="small" 
            showOnlineStatus 
            isOnline={isOnline} 
          />
          
          <View style={styles.textContainer}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {name}
            </ThemedText>
            <ThemedText 
              style={[
                styles.status, 
                { color: isOnline ? theme.online : theme.textSecondary }
              ]}
            >
              {statusText}
            </ThemedText>
          </View>
        </Pressable>
        
        <View style={styles.actions}>
          <Pressable 
            style={styles.actionButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="phone" size={20} color={theme.text} />
          </Pressable>
          <Pressable 
            style={styles.actionButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="more-vertical" size={20} color={theme.text} />
          </Pressable>
        </View>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.chatHeaderHeight,
    paddingHorizontal: Spacing.sm,
  },
  backButton: {
    padding: Spacing.sm,
  },
  info: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginLeft: Spacing.xs,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    ...Typography.chatName,
  },
  status: {
    ...Typography.timestamp,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.sm,
  },
});
