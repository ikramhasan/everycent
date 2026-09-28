import { describe, expect, it } from "vitest";
import { createApiClient } from "./index";

describe("createApiClient", () => {
  it("calls typed paths on the base URL with credentials included", async () => {
    const requests: Request[] = [];
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: async (input) => {
        requests.push(input as Request);
        return Response.json({ status: "ok", database: "ok" });
      },
    });

    const { data, error } = await client.GET("/v1/health");

    expect(error).toBeUndefined();
    expect(data?.status).toBe("ok");
    expect(requests[0]?.url).toBe("http://api.test/v1/health");
    expect(requests[0]?.credentials).toBe("include");
  });

  it("surfaces the API error shape on failure", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: async () =>
        Response.json(
          { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
          { status: 401 },
        ),
    });
    const { data, error } = await client.GET("/v1/me");
    expect(data).toBeUndefined();
    expect(error?.error.code).toBe("UNAUTHORIZED");
  });
});
