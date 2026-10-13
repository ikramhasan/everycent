import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("explains known codes", () => {
    expect(authErrorMessage({ code: "TOKEN_EXPIRED", status: 401 }, "x")).toMatch(/expired/);
  });

  it("reports rate limiting whatever the code", () => {
    expect(authErrorMessage({ status: 429 }, "x")).toMatch(/Too many attempts/);
  });

  it("falls back for anything else", () => {
    expect(authErrorMessage({ code: "SOMETHING", status: 500 }, "Try again.")).toBe("Try again.");
  });
});
