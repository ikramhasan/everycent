import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  WEB_ORIGIN: "http://localhost:5173",
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
  });

  it("coerces PORT", () => {
    expect(parseEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it("fails fast naming the bad variables", () => {
    expect(() =>
      parseEnv({ ...valid, DATABASE_URL: undefined, BETTER_AUTH_SECRET: "short" }),
    ).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET|BETTER_AUTH_SECRET[\s\S]*DATABASE_URL/);
  });
});

describe("parseEnv: email", () => {
  it("treats empty email settings as unset outside production", () => {
    const env = parseEnv({ ...valid, RESEND_API_KEY: "", FROM_EMAIL: "" });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.FROM_EMAIL).toBeUndefined();
  });

  it("requires the Resend key and sender in production", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(
      /RESEND_API_KEY[\s\S]*FROM_EMAIL/,
    );
    expect(
      parseEnv({ ...valid, NODE_ENV: "production", RESEND_API_KEY: "re_x", FROM_EMAIL: "a.dev" })
        .NODE_ENV,
    ).toBe("production");
  });

  it("rejects a key that isn't a Resend key", () => {
    expect(() => parseEnv({ ...valid, RESEND_API_KEY: "sk_live_x" })).toThrow(/RESEND_API_KEY/);
  });
});
