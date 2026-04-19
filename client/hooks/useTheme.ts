import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/useColorScheme";

type ThemeColors = typeof Colors.light & typeof Colors.dark;

export function useTheme(): { theme: ThemeColors; isDark: boolean } {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"] as ThemeColors;

  return {
    theme,
    isDark,
  };
}
