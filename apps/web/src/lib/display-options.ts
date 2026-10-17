import { useCallback, useSyncExternalStore } from "react";

/**
 * YNAB's Display Options that live in the browser (localStorage, seen 2026-10-18): Progress Bars
 * and Balance Style. One store per key, so every component reading a setting follows a change made
 * anywhere (the Display Options dialog, another tab).
 */
function localSetting<T>(
  key: string,
  fallback: T,
  read: (raw: string) => T,
  write: (v: T) => string,
) {
  const listeners = new Set<() => void>();
  let cached: { raw: string | null; value: T } | undefined;
  // Set when storage refuses a write: the value then holds for this visit.
  let unsaved: { value: T } | undefined;
  function get(): T {
    if (unsaved) return unsaved.value;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // Storage can be unavailable (private windows); the default holds for this visit.
    }
    if (cached?.raw !== raw) cached = { raw, value: raw === null ? fallback : read(raw) };
    return cached.value;
  }
  function set(value: T) {
    try {
      localStorage.setItem(key, write(value));
      unsaved = undefined;
    } catch {
      unsaved = { value };
    }
    for (const listener of listeners) listener();
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }
  return function useSetting() {
    const value = useSyncExternalStore(subscribe, get, () => fallback);
    return [value, useCallback(set, [])] as const;
  };
}

/** YNAB's Progress Bars On/Off; they "reset when cookies or local storage are cleared". */
export const useProgressBarsSetting = localSetting(
  "everycent:progress-bars",
  true,
  (raw) => raw !== "off",
  (on) => (on ? "on" : "off"),
);

/**
 * YNAB's Balance Style: "Differentiate Without Color" gives the overspent and cautious Available
 * pills stronger fills and a border, and patterns avatars that share an initial.
 */
export const useDifferentiateWithoutColor = localSetting(
  "everycent:differentiate-without-color",
  false,
  (raw) => raw === "true",
  (on) => String(on),
);
