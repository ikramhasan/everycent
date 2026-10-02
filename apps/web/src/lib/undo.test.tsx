import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { UndoProvider, useUndo } from "./undo";

const wrapper = ({ children }: { children: ReactNode }) => <UndoProvider>{children}</UndoProvider>;

describe("UndoProvider", () => {
  it("runs commands in order and moves them between undo and redo", async () => {
    const first = { label: "first", undo: vi.fn(), redo: vi.fn() };
    const second = { label: "second", undo: vi.fn(), redo: vi.fn() };
    const { result } = renderHook(useUndo, { wrapper });

    act(() => {
      result.current.record(first);
      result.current.record(second);
    });
    expect(result.current.undoLabel).toBe("second");

    await act(() => result.current.undo());
    expect(second.undo).toHaveBeenCalledOnce();
    expect(result.current.undoLabel).toBe("first");
    expect(result.current.redoLabel).toBe("second");

    await act(() => result.current.redo());
    expect(second.redo).toHaveBeenCalledOnce();
    expect(result.current.undoLabel).toBe("second");
    expect(result.current.redoLabel).toBeNull();
  });

  it("clears redo when a new edit is recorded", async () => {
    const { result } = renderHook(useUndo, { wrapper });
    act(() => result.current.record({ label: "old", undo: vi.fn(), redo: vi.fn() }));
    await act(() => result.current.undo());
    act(() => result.current.record({ label: "new", undo: vi.fn(), redo: vi.fn() }));
    expect(result.current.undoLabel).toBe("new");
    expect(result.current.redoLabel).toBeNull();
  });

  it("keeps a failed command available to retry", async () => {
    const failed = {
      label: "failed",
      undo: vi.fn().mockRejectedValue(new Error("no")),
      redo: vi.fn(),
    };
    const { result } = renderHook(useUndo, { wrapper });
    act(() => result.current.record(failed));
    await expect(act(() => result.current.undo())).rejects.toThrow("no");
    expect(result.current.undoLabel).toBe("failed");
    expect(result.current.redoLabel).toBeNull();
  });
});
