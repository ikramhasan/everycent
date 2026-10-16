import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useShortcutsEnabled } from "./preferences";

export interface UndoCommand {
  /** Short description shown in the Undo/Redo button tooltip. */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** A transaction as a mutation returned it: its version, and its transfer's other side's. */
export interface VersionedRow {
  id: string;
  version: number;
  transferSide?: { id: string; version: number } | null;
}

interface UndoState {
  /**
   * The version this tab's own last save left each transaction at (EVERYCENT-36). Undo and redo
   * send it as `expectedVersion`, so a chain of the user's own edits replays, while a partner's
   * change (which this tab never saw a response for) is refused as stale. Only mutation responses
   * go in: a refetched list would hide the partner's change.
   */
  noteVersions: (rows: Iterable<VersionedRow> | Record<string, number>) => void;
  /** The version to expect for `id`: this tab's last, else `fallback`. */
  expectedVersion: (id: string, fallback?: number) => number | undefined;
  undoLabel: string | null;
  redoLabel: string | null;
  busy: boolean;
  record: (command: UndoCommand) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const UndoContext = createContext<UndoState | null>(null);

/**
 * The API refused an undo or redo because a partner changed the row since (EVERYCENT-36). The
 * command can never apply again, so it leaves the history; the error still reaches the caller,
 * whose toast shows the API's message ("Pat changed this transaction since…").
 */
export function isStaleVersion(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    (error as { error?: { code?: unknown } }).error?.code === "STALE_VERSION"
  );
}

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
  const versions = useRef(new Map<string, number>());

  const noteVersions = useCallback((rows: Iterable<VersionedRow> | Record<string, number>) => {
    if (Symbol.iterator in rows) {
      for (const row of rows) {
        versions.current.set(row.id, row.version);
        if (row.transferSide) versions.current.set(row.transferSide.id, row.transferSide.version);
      }
    } else {
      for (const [id, version] of Object.entries(rows)) versions.current.set(id, version);
    }
  }, []);
  const expectedVersion = useCallback(
    (id: string, fallback?: number) => versions.current.get(id) ?? fallback,
    [],
  );

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
    } catch (error) {
      if (isStaleVersion(error)) setPast((commands) => commands.slice(0, -1));
      throw error;
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
    } catch (error) {
      if (isStaleVersion(error)) setFuture((commands) => commands.slice(0, -1));
      throw error;
    } finally {
      setBusy(false);
    }
  }, [future, busy]);

  return (
    <UndoContext.Provider
      value={{
        noteVersions,
        expectedVersion,
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
  const enabled = useShortcutsEnabled();
  useEffect(() => {
    if (!enabled) return;
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
  }, [history, onError, enabled]);
}
