import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { authClient } from "./auth-client";

export const sessionQueryOptions = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession();
    if (error) throw new Error(error.message ?? "Failed to load session");
    return data; // null when signed out
  },
  staleTime: 60_000,
});

/**
 * Force a fresh session fetch and store the result, bypassing staleTime.
 *
 * `invalidateQueries` only marks the cache stale — `ensureQueryData` (used by
 * route `beforeLoad`s) returns stale-but-cached data as-is, so a signed-out
 * `null` would still win a race against a `beforeLoad` that runs right after
 * sign-in/sign-up. Call this after any auth transition instead, so the next
 * `ensureQueryData` call sees the real, current session.
 */
export function refreshSession(queryClient: QueryClient) {
  return queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 });
}
