import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MessageInput({ onSend, disabled = false }: MessageInputProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const sendScale = useSharedValue(1);

  const canSend = message.trim().length > 0 && !disabled;

  const handleSend = async () => {
    if (!canSend) return;
    
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    
    onSend(message.trim());
    setMessage("");
  };

  const handlePressIn = () => {
    if (canSend) {
      sendScale.value = withSpring(0.9, { damping: 15, stiffness: 200 });
    }
  };

  const handlePressOut = () => {
    sendScale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const sendButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
  }));

  return (
    <View 
      style={[
        styles.container, 
        { 
          backgroundColor: theme.backgroundRoot,
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
          borderTopColor: theme.border,
        }
      ]}
    >
      <View 
        style={[
          styles.inputContainer, 
          { backgroundColor: theme.inputBackground }
        ]}
      >
        <Pressable style={styles.iconButton}>
          <Feather name="smile" size={22} color={theme.textSecondary} />
        </Pressable>
        
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder="Message"
          placeholderTextColor={theme.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={4096}
          editable={!disabled}
        />
        
        <Pressable style={styles.iconButton}>
          <Feather name="paperclip" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>
      
      <AnimatedPressable
        onPress={handleSend}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!canSend}
        style={[
          styles.sendButton,
          { backgroundColor: canSend ? theme.primary : theme.surfaceDark },
          sendButtonStyle,
        ]}
      >
        <Feather 
          name="send" 
          size={20} 
          color={canSend ? "#FFFFFF" : theme.textSecondary} 
        />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: BorderRadius.lg,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.sm,
    alignSelf: "flex-end",
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: Platform.OS === "ios" ? 11 : 8,
    paddingHorizontal: Spacing.xs,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
