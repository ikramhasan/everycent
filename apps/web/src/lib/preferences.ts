import { useQuery } from "@tanstack/react-query";
import { $api } from "./api";

export const preferencesQueryOptions = () => $api.queryOptions("get", "/v1/me/preferences");

/**
 * YNAB's "Enable keyboard shortcuts" (undo and redo included). On until the account's options
 * have loaded, as the setting defaults to on.
 */
export function useShortcutsEnabled() {
  const preferences = useQuery(preferencesQueryOptions());
  return preferences.data?.keyboardShortcuts ?? true;
}
