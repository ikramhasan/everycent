import createFetchClient from "openapi-fetch";
import createReactQueryClient from "openapi-react-query";
import type { components, paths } from "./schema.gen";

export type { components, operations, paths } from "./schema.gen";

/** The standard API error body. */
export type ApiError = components["schemas"]["Error"];

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: (input: Request) => Promise<Response>;
}

export function createApiClient({ baseUrl, fetch }: ApiClientOptions) {
  return createFetchClient<paths>({ baseUrl, credentials: "include", fetch });
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** TanStack Query bindings: `$api.useQuery("get", "/v1/me")`, `$api.queryOptions(...)`. */
export function createQueryApi(client: ApiClient) {
  return createReactQueryClient(client);
}
