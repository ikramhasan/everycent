import { createHash } from "node:crypto";
import type { Database } from "@everycent/db";
import { throttle } from "@everycent/db/schema";
import { RateLimiterDrizzle, RateLimiterRes } from "rate-limiter-flexible";
import { Resend } from "resend";
import type { Env } from "../../env";
import { log } from "../log";

export type EmailKind =
  | "verify-email"
  | "change-email-confirm"
  | "change-email-verify"
  | "reset-password"
  | "existing-account"
  | "password-changed"
  | "budget-invitation"
  | "budget-invitation-reminder";

export interface EmailMessage {
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Delivers one email. Injected through `c.var.deps` so tests can read what was sent. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Sends through Resend; throws when Resend refuses the message. */
export class ResendEmailSender implements EmailSender {
  readonly #resend: Resend;
  readonly #from: string;

  constructor(apiKey: string, from: string) {
    this.#resend = new Resend(apiKey);
    this.#from = from;
  }

  async send({ to, subject, text, html }: EmailMessage) {
    const { error } = await this.#resend.emails.send({ from: this.#from, to, subject, text, html });
    if (error) throw new Error(`Resend refused the email: ${error.name}: ${error.message}`);
  }
}

/** Development without a Resend key: prints the email so its link can be followed by hand. */
export class ConsoleEmailSender implements EmailSender {
  async send({ to, subject, text }: EmailMessage) {
    console.log(`\n[email] to ${to}: ${subject}\n${text}\n`);
  }
}

/** Tests: keeps every email in `outbox`. */
export class MemoryEmailSender implements EmailSender {
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.outbox.push(message);
  }
}

/** The most emails of one kind one address receives per hour; the rest are dropped. */
export const EMAILS_PER_ADDRESS_PER_HOUR = 5;

/**
 * Caps how many emails of each kind one address receives, whoever asks for them. Better Auth's
 * limiter is per IP, so someone rotating IPs could otherwise flood a stranger's inbox with reset
 * or verification emails. Dropped emails are logged, never reported to the caller: the endpoints
 * that send them answer the same either way, so a refusal mustn't reveal whether the address
 * exists.
 */
export class ThrottledEmailSender implements EmailSender {
  readonly #inner: EmailSender;
  readonly #limiter: RateLimiterDrizzle;

  constructor(inner: EmailSender, db: Database) {
    this.#inner = inner;
    this.#limiter = new RateLimiterDrizzle({
      storeClient: db,
      schema: throttle,
      keyPrefix: "email",
      points: EMAILS_PER_ADDRESS_PER_HOUR,
      duration: 60 * 60,
    });
  }

  async send(message: EmailMessage) {
    // Hashed so the throttle table never holds email addresses.
    const address = createHash("sha256").update(message.to.trim().toLowerCase()).digest("hex");
    const key = `${message.kind}:${address}`;
    try {
      await this.#limiter.consume(key);
    } catch (e) {
      if (!(e instanceof RateLimiterRes)) throw e;
      log.warn("Email dropped: hourly limit for one address reached", { kind: message.kind });
      return;
    }
    try {
      await this.#inner.send(message);
    } catch (e) {
      // Only emails the provider took count: a failed attempt is retried by the queue, and
      // keeping its point would use up the limit during an outage and drop the email.
      await this.#limiter.reward(key, 1);
      throw e;
    }
  }
}

/** `FROM_EMAIL` as a sender: an address or display form as is, a bare domain as no-reply@. */
export function fromAddress(fromEmail: string): string {
  return fromEmail.includes("@") ? fromEmail : `everycent <no-reply@${fromEmail}>`;
}

/** Resend when configured; otherwise the console (development) or an in-memory outbox (tests). */
export function createEmailSender(env: Env, db: Database): EmailSender {
  let sender: EmailSender;
  if (env.NODE_ENV === "test") sender = new MemoryEmailSender();
  else if (env.RESEND_API_KEY) {
    if (!env.FROM_EMAIL) throw new Error("FROM_EMAIL is required when RESEND_API_KEY is set");
    sender = new ResendEmailSender(env.RESEND_API_KEY, fromAddress(env.FROM_EMAIL));
  } else sender = new ConsoleEmailSender();
  return new ThrottledEmailSender(sender, db);
}
