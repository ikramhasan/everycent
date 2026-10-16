import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { preferencesQueryOptions } from "./preferences";
import { UndoProvider, useUndo, useUndoShortcuts } from "./undo";

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

  it("drops an undo a partner's later change made stale (EVERYCENT-36)", async () => {
    const stale = {
      error: { code: "STALE_VERSION", message: "Pat changed this transaction since" },
    };
    const older = { label: "older", undo: vi.fn(), redo: vi.fn() };
    const command = { label: "edit", undo: vi.fn().mockRejectedValue(stale), redo: vi.fn() };
    const { result } = renderHook(useUndo, { wrapper });
    act(() => {
      result.current.record(older);
      result.current.record(command);
    });
    await expect(act(() => result.current.undo())).rejects.toBe(stale);
    await act(async () => {});
    // It can't apply again, so the next undo is the one before it, and there's nothing to redo.
    expect(result.current.undoLabel).toBe("older");
    expect(result.current.redoLabel).toBeNull();
  });

  it("expects the version this tab's own last save left, transfer sides included", () => {
    const { result } = renderHook(useUndo, { wrapper });
    expect(result.current.expectedVersion("t1", 1)).toBe(1);
    // An edit (v2), then another of the user's own (v3): an older entry's undo expects v3.
    result.current.noteVersions([{ id: "t1", version: 2 }]);
    result.current.noteVersions([{ id: "t1", version: 3, transferSide: { id: "t2", version: 5 } }]);
    expect(result.current.expectedVersion("t1", 2)).toBe(3);
    // Saving one side of a transfer can change the other's.
    expect(result.current.expectedVersion("t2")).toBe(5);
    result.current.noteVersions({ t2: 6 });
    expect(result.current.expectedVersion("t2")).toBe(6);
  });

  it("answers Cmd/Ctrl+Z only while keyboard shortcuts are on", async () => {
    for (const keyboardShortcuts of [true, false]) {
      const queryClient = new QueryClient();
      queryClient.setQueryData(preferencesQueryOptions().queryKey, {
        openLastBudget: true,
        keyboardShortcuts,
      });
      const command = { label: "edit", undo: vi.fn(), redo: vi.fn() };
      const { result } = renderHook(
        () => {
          useUndoShortcuts(() => {});
          return useUndo();
        },
        {
          wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
              <UndoProvider>{children}</UndoProvider>
            </QueryClientProvider>
          ),
        },
      );
      act(() => result.current.record(command));
      await act(async () => {
        fireEvent.keyDown(window, { key: "z", ctrlKey: true });
      });
      expect(command.undo).toHaveBeenCalledTimes(keyboardShortcuts ? 1 : 0);
    }
  });
});
