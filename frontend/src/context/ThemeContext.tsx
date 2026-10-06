import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import type { Theme } from "../services/auth.api";

const THEME_STORAGE_KEY = "documind_theme";

type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getStoredTheme = (): Theme => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "LIGHT" || stored === "DARK" || stored === "SYSTEM"
    ? stored
    : "SYSTEM";
};

const resolveTheme = (theme: Theme, systemPrefersDark: boolean): ResolvedTheme =>
{
  if (theme === "DARK") return "dark";
  if (theme === "LIGHT") return "light";
  return systemPrefersDark ? "dark" : "light";
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemPrefersDark(event.matches);

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // The user's persisted preference (from the backend) is the source of
  // truth once it's known; local/anonymous state only covers pre-login.
  useEffect(() => {
    if (user?.theme) {
      setThemeState(user.theme);
      localStorage.setItem(THEME_STORAGE_KEY, user.theme);
    }
  }, [user?.theme]);

  const resolvedTheme = resolveTheme(theme, systemPrefersDark);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.setAttribute(
      "data-theme",
      resolveTheme(next, window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
};
