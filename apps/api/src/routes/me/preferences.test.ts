import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, resetDatabase, signUp } from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

function send(method: string, path: string, cookie: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json", origin: "http://localhost:5173" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("preferences", () => {
  it("defaults to YNAB's: open the last budget, shortcuts on; changes one at a time", async () => {
    const user = await signUp(app);
    const read = async () => (await send("GET", "/v1/me/preferences", user.cookie)).json();
    expect(await read()).toEqual({ openLastBudget: true, keyboardShortcuts: true });
    const saved = await send("PATCH", "/v1/me/preferences", user.cookie, { openLastBudget: false });
    expect(await saved.json()).toEqual({ openLastBudget: false, keyboardShortcuts: true });
    await send("PATCH", "/v1/me/preferences", user.cookie, { keyboardShortcuts: false });
    expect(await read()).toEqual({ openLastBudget: false, keyboardShortcuts: false });
    // Another person's options are their own.
    const other = await signUp(app);
    expect(await (await send("GET", "/v1/me/preferences", other.cookie)).json()).toEqual({
      openLastBudget: true,
      keyboardShortcuts: true,
    });
  });

  it("changes the first name", async () => {
    const user = await signUp(app, { name: "Old" });
    const res = await send("POST", "/api/auth/update-user", user.cookie, { name: "Robin" });
    expect(res.status).toBe(200);
    const me = (await (await send("GET", "/v1/me", user.cookie)).json()) as { name: string };
    expect(me.name).toBe("Robin");
  });
});
