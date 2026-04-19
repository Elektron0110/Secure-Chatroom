import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";

interface MessageBubbleProps {
  content: string;
  timestamp: string;
  isSent: boolean;
  senderName?: string;
  showSenderName?: boolean;
  isFirstInGroup?: boolean;
  index?: number;
}

export function MessageBubble({
  content,
  timestamp,
  isSent,
  senderName,
  showSenderName = false,
  isFirstInGroup = true,
  index = 0,
}: MessageBubbleProps) {
  const { theme } = useTheme();

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 30).duration(200)}
      style={[
        styles.container,
        isSent ? styles.sentContainer : styles.receivedContainer,
      ]}
    >
      {showSenderName && !isSent && isFirstInGroup && senderName ? (
        <ThemedText style={[styles.senderName, { color: theme.primary }]}>
          {senderName}
        </ThemedText>
      ) : null}
      
      <View
        style={[
          styles.bubble,
          isSent
            ? [styles.sentBubble, { backgroundColor: theme.messageSent }]
            : [styles.receivedBubble, { backgroundColor: theme.messageReceived }],
          !isFirstInGroup && (isSent ? styles.sentNotFirst : styles.receivedNotFirst),
        ]}
      >
        <ThemedText
          style={[
            styles.content,
            { color: isSent ? theme.text : theme.text },
          ]}
        >
          {content}
        </ThemedText>
        
        <ThemedText
          style={[
            styles.timestamp,
            { color: theme.textSecondary },
          ]}
        >
          {timestamp}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xs,
    maxWidth: "75%",
  },
  sentContainer: {
    alignSelf: "flex-end",
    marginLeft: "25%",
  },
  receivedContainer: {
    alignSelf: "flex-start",
    marginRight: "25%",
  },
  bubble: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.message,
  },
  sentBubble: {
    borderTopRightRadius: Spacing.xs,
  },
  receivedBubble: {
    borderTopLeftRadius: Spacing.xs,
  },
  sentNotFirst: {
    borderTopRightRadius: BorderRadius.message,
  },
  receivedNotFirst: {
    borderTopLeftRadius: BorderRadius.message,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  content: {
    ...Typography.message,
  },
  timestamp: {
    ...Typography.timestamp,
    alignSelf: "flex-end",
    marginTop: Spacing.xs,
  },
});
