import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { Avatar } from "@/components/Avatar";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";

interface ChatListItemProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  lastMessage?: string;
  timestamp?: string;
  unreadCount?: number;
  isOnline?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChatListItem({
  name,
  avatarUrl,
  lastMessage,
  timestamp,
  unreadCount = 0,
  isOnline = false,
  onPress,
  onLongPress,
}: ChatListItemProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const backgroundColor = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: backgroundColor.value === 1 
      ? theme.backgroundDefault 
      : "transparent",
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
    backgroundColor.value = 1;
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
    backgroundColor.value = 0;
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.container, animatedStyle]}
    >
      <Avatar 
        uri={avatarUrl} 
        size="medium" 
        showOnlineStatus 
        isOnline={isOnline} 
      />
      
      <View style={styles.content}>
        <View style={styles.header}>
          <ThemedText 
            style={[styles.name, { color: theme.text }]} 
            numberOfLines={1}
          >
            {name}
          </ThemedText>
          {timestamp ? (
            <ThemedText style={[styles.timestamp, { color: theme.textSecondary }]}>
              {timestamp}
            </ThemedText>
          ) : null}
        </View>
        
        <View style={styles.footer}>
          <ThemedText 
            style={[styles.lastMessage, { color: theme.textSecondary }]} 
            numberOfLines={1}
          >
            {lastMessage || "No messages yet"}
          </ThemedText>
          {unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.badgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    ...Typography.chatName,
    flex: 1,
    marginRight: Spacing.sm,
  },
  timestamp: {
    ...Typography.timestamp,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: {
    ...Typography.chatPreview,
    flex: 1,
    marginRight: Spacing.sm,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
});
