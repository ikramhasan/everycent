import type { KeyboardEvent } from "react";

/**
 * Arrow-key movement for a hand-built menu (`role="menu"` with button items), as a menu widget
 * has it (WAI-ARIA menu pattern): Up/Down step through the enabled items and wrap, Home/End go to
 * the first and last. Attach to the menu's onKeyDown. Hand-rolled because these popovers switch
 * into a form (the flag names) that a menu component can't hold.
 */
export function menuKeyDown(event: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "[role=menuitem]:not(:disabled), [role=menuitemradio]:not(:disabled)",
    ),
  ];
  if (items.length === 0) return;
  event.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[at === -1 && event.key === "ArrowUp" ? items.length - 1 : next]?.focus();
}
