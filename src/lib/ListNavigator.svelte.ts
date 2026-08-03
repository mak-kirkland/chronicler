/**
 * ListNavigator.svelte.ts
 *
 * This file encapsulates the "List Navigation" domain.
 * It exports:
 * 1. ListNavigator: A class for managing the state (index, options).
 * 2. handleListNavigation: A helper for handling keyboard events (ArrowUp/Down, Enter).
 */

// --- 1. State Management ---

export class ListNavigator<T> {
    index = $state(0);
    options = $state<T[]>([]);

    constructor(initialOptions: T[] = []) {
        this.options = initialOptions;
    }

    setOptions(newOptions: T[]) {
        this.options = newOptions;
        // Reset index when options change to avoid out-of-bounds
        this.index = 0;
    }

    next() {
        if (this.options.length === 0) return;
        this.index = (this.index + 1) % this.options.length;
    }

    prev() {
        if (this.options.length === 0) return;
        this.index =
            (this.index - 1 + this.options.length) % this.options.length;
    }

    getCurrent(): T | undefined {
        return this.options[this.index];
    }

    get length() {
        return this.options.length;
    }
}

// --- 2. Event Handling ---

export interface NavigationContext {
    isOpen: boolean;
    nav: ListNavigator<any>; // Accepts any generic navigator
    /**
     * Resolves the DOM element for an option index, so the highlighted one can
     * be scrolled into view. A callback rather than a container because the
     * options don't always map 1:1 onto the container's children — a menu with
     * separators and headings interleaves non-options among them.
     */
    getItemEl?: (index: number) => HTMLElement | null | undefined;
    onSelect: (item: any) => void;
    onClose: () => void;
    onOpen?: () => void;
    triggerElement?: HTMLElement | null;
    /**
     * Whether Tab commits the highlighted item, as it does in a completion
     * popup. Menus want the opposite: they open with row 0 already
     * highlighted, so Tab-to-select would fire the first action — Rename, on
     * the file tree's context menu — instead of moving focus.
     */
    selectOnTab?: boolean;
}

/**
 * Handles standard list navigation keys (Arrows, Enter, Escape, Tab).
 * Returns `true` if the event was handled and should stop propagation/default.
 */
export function handleListNavigation(
    e: KeyboardEvent,
    ctx: NavigationContext,
): boolean {
    // 1. Handle Opening (if supported)
    if (!ctx.isOpen) {
        if (
            ctx.onOpen &&
            (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")
        ) {
            e.preventDefault();
            ctx.onOpen();
            return true;
        }
        return false;
    }

    // 2. Handle Closing
    if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // Stop modal from closing if this is inside a modal
        ctx.onClose();
        ctx.triggerElement?.focus();
        return true;
    }

    // 3. Navigation (Down)
    if (e.key === "ArrowDown") {
        e.preventDefault();
        ctx.nav.next();
        ctx.getItemEl?.(ctx.nav.index)?.scrollIntoView({ block: "nearest" });
        return true;
    }

    // 4. Navigation (Up)
    if (e.key === "ArrowUp") {
        e.preventDefault();
        ctx.nav.prev();
        ctx.getItemEl?.(ctx.nav.index)?.scrollIntoView({ block: "nearest" });
        return true;
    }

    // 5. Selection
    if (e.key === "Tab" && ctx.selectOnTab === false) {
        ctx.onClose();
        return false; // Let focus move on naturally.
    }
    if (e.key === "Enter" || e.key === "Tab") {
        // Shift+Enter usually means "create new line" or "force submit", so we ignore it here
        if (!e.shiftKey) {
            const current = ctx.nav.getCurrent();
            // Only capture if we actually have a valid selection to make
            if (current) {
                e.preventDefault();
                ctx.onSelect(current);
                return true;
            }
        }
    }

    return false;
}
