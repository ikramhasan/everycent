import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "./auth-client";
import { refreshSession, sessionQueryOptions } from "./session";

vi.mock("./auth-client", () => ({
  authClient: {
    getSession: vi.fn(),
  },
}));

describe("refreshSession", () => {
  beforeEach(() => {
    vi.mocked(authClient.getSession).mockReset();
  });

  it("replaces a stale-but-cached null session with a freshly fetched one", async () => {
    const queryClient = new QueryClient();
    const user = { id: "1", name: "Ada Lovelace", email: "ada@example.com" };

    // Seed the cache the way `beforeLoad`'s `ensureQueryData` would leave it
    // for a signed-out visitor: a cached `null` that `ensureQueryData` will
    // happily return again even though it's now stale.
    queryClient.setQueryData(sessionQueryOptions.queryKey, null);

    vi.mocked(authClient.getSession).mockResolvedValue({
      data: { session: {}, user },
      error: null,
    } as never);

    await refreshSession(queryClient);

    const session = await queryClient.ensureQueryData(sessionQueryOptions);
    expect(session).toEqual({ session: {}, user });
  });
});
