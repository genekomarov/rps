import { useCallback, useState } from "react";
import { applyStoredTheme, loadTheme, saveTheme, type ThemeMode } from "../lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => applyStoredTheme());

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(saveTheme(next));
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => saveTheme(current === "dark" ? "light" : "dark"));
  }, []);

  return {
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme,
    reload: () => setThemeState(loadTheme()),
  };
}
