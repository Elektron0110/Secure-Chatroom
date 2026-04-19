import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface AvatarProps {
  uri?: string | null;
  size?: "small" | "medium" | "large";
  showOnlineStatus?: boolean;
  isOnline?: boolean;
  style?: ViewStyle;
}

const sizeMap = {
  small: Spacing.avatarSmall,
  medium: Spacing.avatarMedium,
  large: Spacing.avatarLarge,
};

export function Avatar({ 
  uri, 
  size = "medium", 
  showOnlineStatus = false,
  isOnline = false,
  style 
}: AvatarProps) {
  const { theme } = useTheme();
  const avatarSize = sizeMap[size];
  const statusSize = size === "small" ? 10 : 14;

  return (
    <View style={[{ width: avatarSize, height: avatarSize }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }
          ]}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { 
              width: avatarSize, 
              height: avatarSize, 
              borderRadius: avatarSize / 2,
              backgroundColor: theme.primary,
            }
          ]}
        >
          <Feather 
            name="user" 
            size={avatarSize * 0.5} 
            color={theme.buttonText} 
          />
        </View>
      )}
      {showOnlineStatus ? (
        <View
          style={[
            styles.statusIndicator,
            {
              width: statusSize,
              height: statusSize,
              borderRadius: statusSize / 2,
              backgroundColor: isOnline ? theme.online : theme.offline,
              borderColor: theme.backgroundRoot,
            }
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: "#E0E0E0",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  statusIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    borderWidth: 2,
  },
});
