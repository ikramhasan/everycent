import { createRoute, z } from "@hono/zod-openapi";
import { APIError } from "better-auth/api";
import { describe, expect, it, vi } from "vitest";
import { AppError, notFound, onError } from "./errors";
import { createRouter } from "./router";

function buildTestRouter() {
  const router = createRouter();
  router.onError(onError);
  router.notFound(notFound);
  router.openapi(
    createRoute({
      method: "get",
      path: "/items",
      request: { query: z.object({ limit: z.coerce.number().int().min(1) }) },
      responses: { 200: { description: "ok" } },
    }),
    (c) => c.body(null, 200),
  );
  router.get("/app-error", () => {
    throw new AppError(409, "CONFLICT", "Already exists", { field: "email" });
  });
  router.get("/auth-error", () => {
    throw APIError.from("FORBIDDEN", { code: "NOT_ALLOWED", message: "Not allowed" });
  });
  router.get("/boom", () => {
    throw new Error("secret internal detail");
  });
  return router;
}

describe("error handling", () => {
  it("turns validation failures into a 400 VALIDATION_ERROR with issue details", async () => {
    const res = await buildTestRouter().request("/items?limit=abc");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: unknown } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([
      expect.objectContaining({ path: "limit", message: expect.any(String) }),
    ]);
  });

  it("renders AppError with its status, code and details", async () => {
    const res = await buildTestRouter().request("/app-error");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "CONFLICT", message: "Already exists", details: { field: "email" } },
    });
  });

  it("renders Better Auth APIErrors in the standard shape", async () => {
    const res = await buildTestRouter().request("/auth-error");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "NOT_ALLOWED", message: "Not allowed" } });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await buildTestRouter().request("/boom");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret internal detail");
    expect(JSON.parse(text).error.code).toBe("INTERNAL_ERROR");
    spy.mockRestore();
  });

  it("renders unknown routes as 404 NOT_FOUND", async () => {
    const res = await buildTestRouter().request("/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
