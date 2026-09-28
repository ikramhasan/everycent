import { createApiClient, createQueryApi } from "@everycent/api-client";

export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? window.location.origin,
});

/** Typed TanStack Query bindings for the everycent API. */
export const $api = createQueryApi(apiClient);
