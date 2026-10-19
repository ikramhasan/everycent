import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authOf, createTestApp, resetDatabase, signIn, signUp } from "../../test/helpers";
import { resetPassword } from "./reset-password";

const { app, db, close } = createTestApp({ sendsEmail: false });
beforeEach(() => resetDatabase(db));
afterAll(close);

describe("resetPassword", () => {
  it("sets a temporary password, drops the old one and signs the account out everywhere", async () => {
    const { email, password, cookie } = await signUp(app);
    expect((await app.request("/v1/me", { headers: { cookie } })).status).toBe(200);

    const temporary = await resetPassword(db, authOf(app), email.toUpperCase());
    expect(temporary).toBeTruthy();

    expect((await app.request("/v1/me", { headers: { cookie } })).status).toBe(401);
    await expect(signIn(app, email, password)).rejects.toThrow();
    const fresh = await signIn(app, email, temporary as string);
    expect((await app.request("/v1/me", { headers: { cookie: fresh } })).status).toBe(200);
  });

  it("leaves other accounts alone", async () => {
    const a = await signUp(app);
    const b = await signUp(app);
    await resetPassword(db, authOf(app), a.email);
    expect((await app.request("/v1/me", { headers: { cookie: b.cookie } })).status).toBe(200);
    await expect(signIn(app, b.email, b.password)).resolves.toContain("session_token=");
  });

  it("gives a different password each time, and null for an unknown address", async () => {
    const { email } = await signUp(app);
    const first = await resetPassword(db, authOf(app), email);
    const second = await resetPassword(db, authOf(app), email);
    expect(first).not.toBe(second);
    expect(await resetPassword(db, authOf(app), "nobody@example.com")).toBeNull();
  });
});
