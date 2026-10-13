import { budgetInvitation } from "@everycent/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createBudget,
  createTestApp,
  emailsTo,
  linkToken,
  resetDatabase,
  signUp,
} from "../../../test/helpers";

const { app, db, close } = createTestApp();
beforeEach(() => resetDatabase(db));
afterAll(close);

type Members = {
  members: { userId: string; email: string; role: string }[];
  invitations: { id: string; email: string; name: string; expired: boolean }[];
  maxPeople: number;
};
type ErrorBody = { error: { code: string; message: string } };

function send(method: string, path: string, cookie: string | null, body?: unknown) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async <T>(res: Response) => (await res.json()) as T;
const code = async (res: Response) => (await json<ErrorBody>(res)).error.code;

async function setup() {
  const owner = await signUp(app, { name: "Owner" });
  const budget = await createBudget(app, owner.cookie);
  const base = `/v1/budgets/${budget.id}`;
  const invite = (email: string, name = "Pat", cookie = owner.cookie) =>
    send("POST", `${base}/invitations`, cookie, { name, email });
  const members = async (cookie = owner.cookie) =>
    json<Members>(await send("GET", `${base}/members`, cookie));
  return { owner, budget, base, invite, members };
}

describe("budget invitations", () => {
  it("invites by email; the invitee views the link, signs up and joins as an editor", async () => {
    const { owner, budget, invite, members } = await setup();
    const email = `pat-${crypto.randomUUID()}@example.com`;
    const res = await invite(email.toUpperCase());
    expect(res.status).toBe(201);
    const listed = await members();
    expect(listed.invitations).toEqual([
      expect.objectContaining({ email, name: "Pat", expired: false }),
    ]);
    expect(listed.maxPeople).toBe(6);

    const sent = emailsTo(app, email, "budget-invitation");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain(owner.email);
    // Free text (the budget's name) stays out of the email.
    expect(sent[0]?.text).not.toContain(budget.name);
    const token = linkToken(sent[0]);

    // No session needed to see what it's for.
    const view = await send("POST", "/v1/invitations/view", null, { token });
    expect(view.status).toBe(200);
    expect(await json(view)).toMatchObject({
      email,
      budgetName: budget.name,
      inviterName: "Owner",
      inviterEmail: owner.email,
    });

    const pat = await signUp(app, { email });
    const accepted = await send("POST", "/v1/invitations/accept", pat.cookie, { token });
    expect(accepted.status).toBe(200);
    expect(await json(accepted)).toEqual({ budgetId: budget.id });

    const after = await members();
    expect(after.members.map((m) => [m.email, m.role])).toEqual([
      [owner.email, "owner"],
      [email, "editor"],
    ]);
    expect(after.invitations).toEqual([]);
    // The partner sees the budget, but not invitations.
    expect((await members(pat.cookie)).invitations).toEqual([]);

    // A link works once.
    expect((await send("POST", "/v1/invitations/accept", pat.cookie, { token })).status).toBe(404);
  });

  it("only accepts for the invited address", async () => {
    const { invite } = await setup();
    const email = `pat-${crypto.randomUUID()}@example.com`;
    await invite(email);
    const token = linkToken(emailsTo(app, email, "budget-invitation")[0]);
    const stranger = await signUp(app);
    const res = await send("POST", "/v1/invitations/accept", stranger.cookie, { token });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("INVITATION_EMAIL_MISMATCH");
    expect((await send("POST", "/v1/invitations/accept", null, { token })).status).toBe(401);
  });

  it("refuses members, duplicates and a seventh person", async () => {
    const { owner, invite } = await setup();
    expect(await code(await invite(owner.email))).toBe("ALREADY_MEMBER");
    for (let i = 0; i < 5; i++) {
      expect((await invite(`p${i}-${crypto.randomUUID()}@example.com`)).status).toBe(201);
    }
    const again = await invite("x@example.com");
    expect(again.status).toBe(409);
    expect(await code(again)).toBe("BUDGET_FULL");
  });

  it("won't invite the same address twice, but resends with a new link", async () => {
    const { base, owner, invite, members } = await setup();
    const email = `pat-${crypto.randomUUID()}@example.com`;
    await invite(email);
    expect(await code(await invite(email))).toBe("ALREADY_INVITED");
    const first = linkToken(emailsTo(app, email, "budget-invitation")[0]);
    const { invitations } = await members();
    const id = invitations[0]?.id;
    const resent = await send("POST", `${base}/invitations/${id}/resend`, owner.cookie);
    expect(resent.status).toBe(200);
    const sent = emailsTo(app, email, "budget-invitation");
    expect(sent).toHaveLength(2);
    const second = linkToken(sent[1]);
    expect(second).not.toBe(first);
    // The old link stops working.
    expect((await send("POST", "/v1/invitations/view", null, { token: first })).status).toBe(404);
    expect((await send("POST", "/v1/invitations/view", null, { token: second })).status).toBe(200);
  });

  it("cancels an invitation, and an expired one says so", async () => {
    const { base, owner, invite, members } = await setup();
    const email = `pat-${crypto.randomUUID()}@example.com`;
    await invite(email);
    const token = linkToken(emailsTo(app, email, "budget-invitation")[0]);
    const id = (await members()).invitations[0]?.id as string;

    await db
      .update(budgetInvitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(budgetInvitation.id, id));
    const expired = await send("POST", "/v1/invitations/view", null, { token });
    expect(expired.status).toBe(410);
    expect(await code(expired)).toBe("INVITATION_EXPIRED");
    expect((await members()).invitations[0]?.expired).toBe(true);
    // Inviting the address again replaces the expired invitation.
    expect((await invite(email)).status).toBe(201);
    const fresh = (await members()).invitations;
    expect(fresh).toHaveLength(1);

    const canceled = await send("DELETE", `${base}/invitations/${fresh[0]?.id}`, owner.cookie);
    expect(canceled.status).toBe(204);
    expect((await members()).invitations).toEqual([]);
    const latest = linkToken(emailsTo(app, email, "budget-invitation").at(-1));
    expect((await send("POST", "/v1/invitations/view", null, { token: latest })).status).toBe(404);
  });

  it("lets only the owner manage invitations", async () => {
    const { base, invite } = await setup();
    const email = `pat-${crypto.randomUUID()}@example.com`;
    await invite(email);
    const pat = await signUp(app, { email });
    const token = linkToken(emailsTo(app, email, "budget-invitation")[0]);
    await send("POST", "/v1/invitations/accept", pat.cookie, { token });
    const res = await invite(`x-${crypto.randomUUID()}@example.com`, "X", pat.cookie);
    expect(res.status).toBe(403);
    const stranger = await signUp(app);
    expect((await send("GET", `${base}/members`, stranger.cookie)).status).toBe(404);
  });
});
