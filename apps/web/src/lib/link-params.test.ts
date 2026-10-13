import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readLinkParams, useLinkParams } from "./link-params";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("readLinkParams", () => {
  it("reads the token and step from the fragment", () => {
    expect(readLinkParams("#token=abc.def&step=approve")).toEqual({
      token: "abc.def",
      step: "approve",
    });
  });

  it("returns nulls without a fragment", () => {
    expect(readLinkParams("")).toEqual({ token: null, step: null });
  });
});

describe("useLinkParams", () => {
  it("keeps the token and clears it from the address bar", () => {
    window.history.replaceState(null, "", "/verify-email#token=abc.def");
    const { result } = renderHook(() => useLinkParams());
    expect(result.current.token).toBe("abc.def");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/verify-email");
  });

  it("picks up a second link opened in the same tab", () => {
    window.history.replaceState(null, "", "/verify-email#token=first");
    const { result } = renderHook(() => useLinkParams());
    act(() => {
      window.history.replaceState(null, "", "/verify-email#token=second&step=change");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current).toMatchObject({ token: "second", step: "change" });
    expect(result.current.opened).toBeGreaterThan(0);
    expect(window.location.hash).toBe("");
  });
});
