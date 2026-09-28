import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

describe("GET /v1/me", () => {
  it("returns 401 in the standard error shape without a session", async () => {
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  });

  it("returns 401 (not 500) for a garbage session cookie", async () => {
    const res = await app.request("/v1/me", {
      headers: { cookie: "better-auth.session_token=not-a-real-token.bad-signature" },
    });
    expect(res.status).toBe(401);
    const errBody = (await res.json()) as { error: { code: string } };
    expect(errBody.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the signed-in user", async () => {
    const { cookie, email } = await signUp(app, { name: "Ada Lovelace" });
    const res = await app.request("/v1/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
      image: string | null;
      createdAt: string;
    };
    expect(body).toMatchObject({ name: "Ada Lovelace", email, emailVerified: false, image: null });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
  });

  it("rejects a duplicate sign-up with a client error, not a 500", async () => {
    const { email } = await signUp(app);
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email, password: "another-password-123", name: "Dup" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects a wrong password", async () => {
    const { email } = await signUp(app);
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: JSON.stringify({ email, password: "definitely-wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("is documented as cookie-authenticated", async () => {
    const doc = (await (await app.request("/openapi.json")).json()) as {
      components: { securitySchemes: Record<string, { type: string; in: string }> };
      paths: Record<string, { get: { security?: unknown; operationId?: string } }>;
    };
    expect(doc.components.securitySchemes.cookieAuth).toMatchObject({
      type: "apiKey",
      in: "cookie",
    });
    expect(doc.paths["/v1/me"]?.get.security).toEqual([{ cookieAuth: [] }]);
    expect(doc.paths["/v1/me"]?.get.operationId).toBe("getMe");
  });
});
