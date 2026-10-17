import { QueryClient, QueryClientContext } from "@tanstack/react-query";
import { useContext } from "react";

/** Stands in outside a QueryClientProvider (a component rendered on its own in a test). */
const standIn = new QueryClient();

/**
 * The app's query client, or a stand-in when there's none, for optional extras (a setting, an
 * avatar pattern) that shouldn't make every component need a provider. Queries made with the
 * stand-in should be disabled.
 */
export function useOptionalQueryClient() {
  const client = useContext(QueryClientContext);
  return { client: client ?? standIn, present: client !== undefined };
}
