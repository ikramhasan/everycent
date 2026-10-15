import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** The window's width in CSS pixels (what CSS `min-width` media queries compare against). */
export function useViewportWidth() {
  return useSyncExternalStore(subscribe, () => window.innerWidth);
}
