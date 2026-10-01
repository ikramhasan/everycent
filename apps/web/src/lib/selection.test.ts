import { describe, expect, it } from "vitest";
import { isEmpty, isSelected, NOTHING, rangeTo, selectionBody, setSelected } from "./selection";

describe("register selection", () => {
  it("ticks rows one by one", () => {
    const s = setSelected(NOTHING, ["a", "b"], true);
    expect(isSelected(s, "a")).toBe(true);
    expect(isSelected(s, "c")).toBe(false);
    expect(isEmpty(setSelected(s, ["a", "b"], false))).toBe(true);
    expect(selectionBody(s, { q: "x" })).toEqual({ ids: ["a", "b"] });
  });

  it("selects all matching, including rows not loaded, minus unticked ones", () => {
    const all = setSelected({ mode: "all", except: new Set() }, ["b"], false);
    expect(isSelected(all, "not-loaded-yet")).toBe(true);
    expect(isSelected(all, "b")).toBe(false);
    expect(selectionBody(all, { q: "x" })).toEqual({ filter: { q: "x" }, exclude: ["b"] });
  });

  it("selects a shift-click range either way", () => {
    const order = ["a", "b", "c", "d"];
    expect(rangeTo(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeTo(order, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeTo(order, null, "c")).toEqual(["c"]);
    expect(rangeTo(order, "gone", "c")).toEqual(["c"]);
  });
});
