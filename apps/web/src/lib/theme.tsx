import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  themes: Theme[];
  setTheme: Dispatch<SetStateAction<Theme>>;
}

const STORAGE_KEY = "theme";
const THEMES: Theme[] = ["light", "dark", "system"];

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const FALLBACK: ThemeContextValue = {
  theme: "system",
  resolvedTheme: "light",
  systemTheme: "light",
  themes: THEMES,
  setTheme: () => {},
};

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable (private mode, disabled storage, etc.) — fall back to system.
  }
  return "system";
}

function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

/** Briefly disables CSS transitions while the theme class flips, so nothing visibly animates. */
function withTransitionsDisabled(apply: () => void) {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);
  apply();
  // Force a reflow so the disabling rule is in effect before it's removed.
  window.getComputedStyle(document.body).transition;
  window.setTimeout(() => document.head.removeChild(style), 0);
}

/**
 * Minimal, client-only theme provider with the same public shape as
 * next-themes' `ThemeProvider` + `useTheme` — but without next-themes'
 * inline anti-flash `<script>` tag. That script is meant to run as part of
 * server-rendered HTML, before React hydrates; in this app there is no
 * server render, so the tag is emitted by React itself when `ThemeProvider`
 * renders, and a script React renders is never executed on the client. That
 * produces a "script tag" console warning for no benefit here. Equivalent
 * anti-flash behavior instead lives as a real, static `<script>` in
 * index.html, which the browser does execute, before this provider mounts.
 *
 * Aliased to the "next-themes" import specifier in vite.config.ts, so
 * `@everycent/ui`'s sonner.tsx — which imports `useTheme` from "next-themes"
 * directly — resolves to this implementation too and stays in sync with the
 * app's actual theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue;
      if (next === "light" || next === "dark" || next === "system") setThemeState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    withTransitionsDisabled(() => applyResolvedTheme(resolvedTheme));
  }, [resolvedTheme]);

  const setTheme = useCallback<Dispatch<SetStateAction<Theme>>>((value) => {
    setThemeState((previous) => {
      const next = typeof value === "function" ? value(previous) : value;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore — theme still applies for this session, just isn't persisted.
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, systemTheme, themes: THEMES, setTheme }),
    [theme, resolvedTheme, systemTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK;
}
