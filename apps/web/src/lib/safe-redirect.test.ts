import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("keeps same-origin paths, including search and hash", () => {
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/budget?month=2026-09#top")).toBe("/budget?month=2026-09#top");
  });

  it("falls back to / for anything that could leave the site", () => {
    for (const target of [
      undefined,
      null,
      42,
      "",
      "budget",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/%2F%2Fevil.com",
    ]) {
      expect(safeRedirect(target), String(target)).toBe("/");
    }
  });
});
