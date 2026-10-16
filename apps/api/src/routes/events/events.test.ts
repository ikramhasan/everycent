import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createBudget,
  createTestApp,
  resetDatabase,
  shareBudget,
  signUp,
} from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

function send(method: string, path: string, cookie: string, body?: unknown, headers = {}) {
  return app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Reads a server-sent event stream until `done` says so (or the stream ends). */
async function readUntil(res: Response, done: (text: string) => boolean, ms = 5000) {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  while (!done(text) && Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now())),
    ]);
    if (!chunk || chunk.done) break;
    text += decoder.decode(chunk.value);
  }
  await reader.cancel();
  return text;
}

const changes = (text: string) =>
  text
    .split("\n\n")
    .filter((block) => block.includes("event: change"))
    .map((block) => JSON.parse(block.split("data: ")[1] ?? "{}") as Record<string, string>);

describe("live updates (EVERYCENT-90)", () => {
  it("tells a member's open stream about a partner's change, with the tab that made it", async () => {
    const owner = await signUp(app, { name: "Owner" });
    const budget = await createBudget(app, owner.cookie);
    const pat = await shareBudget(app, owner.cookie, budget.id);
    const stream = await send("GET", `/v1/budgets/${budget.id}/events`, owner.cookie);
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");

    const reading = readUntil(stream, (text) => changes(text).length > 0);
    // Let the stream subscribe before the change commits.
    await new Promise((r) => setTimeout(r, 200));
    const noted = await send(
      "PUT",
      `/v1/budgets/${budget.id}/months/2026-10/note`,
      pat.cookie,
      { note: "Hi" },
      { "x-client-id": "pats-tab" },
    );
    expect(noted.status).toBe(200);
    expect(changes(await reading)).toEqual([
      { table: "month_note", actorId: pat.userId, clientId: "pats-tab" },
    ]);
  });

  it("is only for members, and ends for someone removed", async () => {
    const owner = await signUp(app, { name: "Owner" });
    const budget = await createBudget(app, owner.cookie);
    const stranger = await signUp(app);
    expect((await send("GET", `/v1/budgets/${budget.id}/events`, stranger.cookie)).status).toBe(
      404,
    );

    const pat = await shareBudget(app, owner.cookie, budget.id);
    const stream = await send("GET", `/v1/budgets/${budget.id}/events`, pat.cookie);
    const started = Date.now();
    const reading = readUntil(stream, () => false, 4000);
    await new Promise((r) => setTimeout(r, 200));
    const removed = await send(
      "DELETE",
      `/v1/budgets/${budget.id}/members/${pat.userId}`,
      owner.cookie,
    );
    expect(removed.status).toBe(204);
    // Changes after the removal never reach the stream, which has closed.
    await send("PUT", `/v1/budgets/${budget.id}/months/2026-10/note`, owner.cookie, {
      note: "secret",
    });
    const text = await reading;
    expect(changes(text).filter((c) => c.table === "month_note")).toEqual([]);
    // It ended on the removal, well before the read gave up.
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
