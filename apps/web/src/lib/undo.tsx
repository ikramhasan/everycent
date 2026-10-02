import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export interface UndoCommand {
  /** Short description shown in the Undo/Redo button tooltip. */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface UndoState {
  undoLabel: string | null;
  redoLabel: string | null;
  busy: boolean;
  record: (command: UndoCommand) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const UndoContext = createContext<UndoState | null>(null);

/**
 * A budget's undo history deliberately lives only in this provider. It is neither persisted nor
 * sent to the server, so another partner and another browser have independent histories. The
 * commands themselves use normal API mutations, which makes their resulting state authoritative
 * on the server once undo or redo completes.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [past, setPast] = useState<UndoCommand[]>([]);
  const [future, setFuture] = useState<UndoCommand[]>([]);
  const [busy, setBusy] = useState(false);

  const record = useCallback((command: UndoCommand) => {
    setPast((commands) => [...commands, command]);
    setFuture([]);
  }, []);

  const undo = useCallback(async () => {
    const command = past.at(-1);
    if (!command || busy) return;
    setBusy(true);
    try {
      await command.undo();
      setPast((commands) => commands.slice(0, -1));
      setFuture((commands) => [...commands, command]);
    } finally {
      setBusy(false);
    }
  }, [past, busy]);

  const redo = useCallback(async () => {
    const command = future.at(-1);
    if (!command || busy) return;
    setBusy(true);
    try {
      await command.redo();
      setFuture((commands) => commands.slice(0, -1));
      setPast((commands) => [...commands, command]);
    } finally {
      setBusy(false);
    }
  }, [future, busy]);

  return (
    <UndoContext.Provider
      value={{
        undoLabel: past.at(-1)?.label ?? null,
        redoLabel: future.at(-1)?.label ?? null,
        busy,
        record,
        undo,
        redo,
      }}
    >
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const value = useContext(UndoContext);
  if (!value) throw new Error("useUndo must be used inside UndoProvider");
  return value;
}

/** Browser-native undo keeps priority while the user is typing in an editable control. */
function isEditing(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useUndoShortcuts(onError: (error: unknown) => void) {
  const history = useUndo();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditing(event.target) || event.altKey || (!event.metaKey && !event.ctrlKey)) return;
      const undo = event.key.toLowerCase() === "z" && !event.shiftKey;
      const redo =
        (event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y";
      if ((!undo || !history.undoLabel) && (!redo || !history.redoLabel)) return;
      event.preventDefault();
      void (undo ? history.undo() : history.redo()).catch(onError);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, onError]);
}
