const THEME_KEY = "rpschat.theme.v1";

export type ThemeMode = "light" | "dark";

export const DEFAULT_THEME: ThemeMode = "light";

function hasDocument(): boolean {
  return typeof document !== "undefined";
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function normalizeTheme(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

export function loadTheme(): ThemeMode {
  if (!hasWindow()) return DEFAULT_THEME;
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeMode): void {
  if (!hasDocument()) return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#0b1220" : "#111827");
  }
}

export function saveTheme(theme: ThemeMode): ThemeMode {
  const next = normalizeTheme(theme);
  if (hasWindow()) {
    window.localStorage.setItem(THEME_KEY, next);
  }
  applyTheme(next);
  return next;
}

export function applyStoredTheme(): ThemeMode {
  const theme = loadTheme();
  applyTheme(theme);
  return theme;
}
