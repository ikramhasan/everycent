import { useSuspenseQuery } from "@tanstack/react-query";
import { $api } from "./api";

/** How the server is set up (`GET /v1/instance`); it doesn't change while the page is open. */
export const instanceQueryOptions = {
  ...$api.queryOptions("get", "/v1/instance"),
  staleTime: Number.POSITIVE_INFINITY,
};

/** The server's setup; the root route loads it before any page renders. */
export function useInstance() {
  return useSuspenseQuery(instanceQueryOptions).data;
}
