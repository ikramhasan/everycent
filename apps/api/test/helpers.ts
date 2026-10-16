import { createDb, type Database, sql } from "@everycent/db";
import type { App } from "../src/app";
import { createApp } from "../src/app";
import { type Env, parseEnv } from "../src/env";
import { type AuthOptions, createAuth } from "../src/lib/auth";
import {
  type EmailKind,
  type EmailMessage,
  MemoryEmailSender,
  ThrottledEmailSender,
} from "../src/lib/email/sender";
import { FakeFxProvider } from "../src/lib/fx/fake";
import { loadRootEnv } from "../src/load-env";
import type { AppDeps } from "../src/types";

export function testEnv(): Env {
  loadRootEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  return parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:3000",
    WEB_ORIGIN: "http://localhost:5173",
  });
}

const outboxes = new WeakMap<App, MemoryEmailSender>();

export function createTestApp({
  serverDate = () => null,
  fxProviders = [new FakeFxProvider()],
  ...authOptions
}: Partial<Pick<AppDeps, "serverDate" | "fxProviders">> & AuthOptions = {}) {
  const env = testEnv();
  const { db, close } = createDb(env.DATABASE_URL, { max: 2 });
  // Real throttling over an in-memory outbox, so tests can read what was sent.
  const outbox = new MemoryEmailSender();
  const email = new ThrottledEmailSender(outbox, db);
  // Tests pick their own `today`, so the server's date doesn't bound it unless a test sets one.
  const app = createApp({
    db,
    env,
    email,
    auth: createAuth(db, env, email, authOptions),
    serverDate,
    fxProviders,
  });
  outboxes.set(app, outbox);
  return { app, db, env, outbox, fxProviders, close };
}

/** Every email `app` sent to `to` (optionally of one kind), oldest first. */
export function emailsTo(app: App, to: string, kind?: EmailKind): EmailMessage[] {
  const outbox = outboxes.get(app);
  if (!outbox) throw new Error("not an app from createTestApp");
  return outbox.outbox.filter((m) => m.to === to && (!kind || m.kind === kind));
}

/** `value`, or a failed test when it's missing. */
export function one<T>(value: T | undefined, what = "value"): T {
  if (value === undefined) throw new Error(`expected a ${what}`);
  return value;
}

/** The token in an email's link (links carry it in the URL fragment). */
export function linkToken(maybeMessage: EmailMessage | undefined): string {
  const message = one(maybeMessage, "sent email");
  const url = message.text.match(/https?:\/\/\S+#\S+/)?.[0];
  if (!url) throw new Error(`no link with a token in "${message.subject}"`);
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get("token");
  if (!token) throw new Error(`no token in ${url}`);
  return token;
}

const ORIGIN = { origin: "http://localhost:5173" };

/** Signs in with email and password; returns the session cookie. */
export async function signIn(app: App, email: string, password: string): Promise<string> {
  const res = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", ...ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Empties every table in the public schema (future tables included automatically). */
export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}

/**
 * Signs up, confirms the address through the emailed link and signs in, the way a person would
 * (sign-up alone gives no session until the email is confirmed).
 */
export async function signUp(
  app: App,
  input: { email?: string; password?: string; name?: string } = {},
): Promise<{ cookie: string; email: string; password: string }> {
  const email = input.email ?? `user-${crypto.randomUUID()}@example.com`;
  const password = input.password ?? "correct-horse-battery";
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", ...ORIGIN },
    body: JSON.stringify({ email, password, name: input.name ?? "Test User" }),
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const sent = emailsTo(app, email, "verify-email").at(-1);
  if (!sent) throw new Error(`no verification email for ${email}`);
  const verified = await app.request(
    `/api/auth/verify-email?token=${encodeURIComponent(linkToken(sent))}`,
  );
  if (verified.status !== 200) throw new Error(`verify failed: ${verified.status}`);
  return { cookie: await signIn(app, email, password), email, password };
}

export interface TestBudget {
  id: string;
  name: string;
  currency: string;
  numberFormat: string;
  currencySymbolPosition: string;
  dateFormat: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export const budgetInput = {
  name: "Household",
  currency: "USD",
  numberFormat: "comma_dot",
  currencySymbolPosition: "before",
  dateFormat: "MM/DD/YYYY",
} as const;

/** Creates a budget through the API as the user behind `cookie`. */
export async function createBudget(
  app: App,
  cookie: string,
  input: Partial<Record<keyof typeof budgetInput, string>> = {},
): Promise<TestBudget> {
  const res = await app.request("/v1/budgets", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ...budgetInput, ...input }),
  });
  if (res.status !== 201)
    throw new Error(`create budget failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TestBudget;
}
