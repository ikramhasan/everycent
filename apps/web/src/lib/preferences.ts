import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { useContext } from "react";
import { $api } from "./api";

export const preferencesQueryOptions = () => $api.queryOptions("get", "/v1/me/preferences");

/** Stands in outside a QueryClientProvider (a component rendered on its own in a test). */
const noClient = new QueryClient();

/**
 * YNAB's "Enable keyboard shortcuts" (undo and redo included). On until the account's options
 * have loaded, as the setting defaults to on, and on where there's no query client to load them.
 */
export function useShortcutsEnabled() {
  const client = useContext(QueryClientContext);
  const preferences = useQuery(
    { ...preferencesQueryOptions(), enabled: client !== undefined },
    client ?? noClient,
  );
  return preferences.data?.keyboardShortcuts ?? true;
}
