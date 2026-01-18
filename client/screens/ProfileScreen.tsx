import React from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/lib/auth-context";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function ProfileScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logout();
  };

  const menuItems = [
    { icon: "bell", label: "Notifications", onPress: () => {} },
    { icon: "lock", label: "Privacy", onPress: () => {} },
    { icon: "moon", label: "Appearance", onPress: () => {} },
    { icon: "help-circle", label: "Help", onPress: () => {} },
    { icon: "info", label: "About", onPress: () => {} },
  ];

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={styles.profileSection}>
        <Avatar uri={user?.avatarUrl} size="large" />
        <ThemedText type="h3" style={styles.displayName}>
          {user?.displayName || "User"}
        </ThemedText>
        <ThemedText style={[styles.username, { color: theme.textSecondary }]}>
          @{user?.username || "username"}
        </ThemedText>
      </View>

      <Card elevation={1} style={styles.menuCard}>
        {menuItems.map((item, index) => (
          <Pressable
            key={item.label}
            style={[
              styles.menuItem,
              index < menuItems.length - 1 && [
                styles.menuItemBorder,
                { borderBottomColor: theme.border }
              ],
            ]}
            onPress={item.onPress}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: theme.primary + "20" }]}>
              <Feather name={item.icon as any} size={20} color={theme.primary} />
            </View>
            <ThemedText style={styles.menuLabel}>{item.label}</ThemedText>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        ))}
      </Card>

      <Button onPress={handleLogout} style={styles.logoutButton}>
        Sign Out
      </Button>

      <ThemedText style={[styles.version, { color: theme.textSecondary }]}>
        Version 1.0.0
      </ThemedText>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  displayName: {
    marginTop: Spacing.lg,
  },
  username: {
    marginTop: Spacing.xs,
  },
  menuCard: {
    marginBottom: Spacing["2xl"],
    padding: 0,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: "#DC3545",
  },
  version: {
    textAlign: "center",
    marginTop: Spacing["2xl"],
    fontSize: 12,
  },
});
