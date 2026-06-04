/**
 * Generic, in-memory undo/redo stacks. `push(snapshot)` records the state
 * *before* a change (and clears redo). `undo(current)` moves `current` onto
 * the redo stack and returns the previous snapshot; `redo(current)` is the
 * mirror. Bounded to `limit` entries (oldest dropped).
 */
export interface History<T> {
    push(snapshot: T): void;
    undo(current: T): T | null;
    redo(current: T): T | null;
    canUndo(): boolean;
    canRedo(): boolean;
    clear(): void;
}

export function createHistory<T>(limit: number): History<T> {
    let undoStack: T[] = [];
    let redoStack: T[] = [];

    return {
        push(snapshot: T) {
            undoStack.push(snapshot);
            if (undoStack.length > limit) undoStack.shift();
            redoStack = [];
        },
        undo(current: T): T | null {
            const prev = undoStack.pop();
            if (prev === undefined) return null;
            redoStack.push(current);
            return prev;
        },
        redo(current: T): T | null {
            const next = redoStack.pop();
            if (next === undefined) return null;
            undoStack.push(current);
            return next;
        },
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
        clear() {
            undoStack = [];
            redoStack = [];
        },
    };
}
