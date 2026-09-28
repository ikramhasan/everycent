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
