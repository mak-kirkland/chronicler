/**
 * SelectController.svelte.ts
 *
 * A headless controller that encapsulates ALL shared logic for Select and SearchableSelect.
 * This is the single source of truth for:
 *   - Open/close state (with singleton behavior — only one select open at a time)
 *   - Keyboard navigation (delegating to ListNavigator)
 *   - Mouse-move guard (keyboard nav isn't "stolen" by a stationary mouse)
 *   - Outside-click and outside-scroll dismissal
 *
 * Components use `createSelectContext()` to wire up the controller,
 * reactive $effects, and onDestroy cleanup in one call.
 */

import { onDestroy } from "svelte";
import {
    ListNavigator,
    handleListNavigation,
} from "$lib/ListNavigator.svelte";

// --- Singleton Registry ---
// Tracks which controller is currently open. Opening one closes others.
let activeController: SelectController<any> | null = $state(null);

export interface SelectOption<T> {
    value: T;
    label: string;
    disabled?: boolean;
}

export class SelectController<T> {
    // --- Public Reactive State ---
    isOpen = $state(false);
    nav: ListNavigator<SelectOption<T>>;

    /**
     * The index currently highlighted by the mouse. Set to -1 when using
     * keyboard navigation, so that only the keyboard highlight shows.
     * Components should show the mouse highlight when mouseIndex >= 0
     * and otherwise fall back to nav.index.
     */
    mouseIndex = $state(-1);

    // --- Element References (set by the component via bind:this) ---
    triggerEl = $state<HTMLElement | null>(null);
    listEl = $state<HTMLElement | null>(null);
    menuEl = $state<HTMLDivElement | null>(null);

    // --- Mouse-move guard ---
    // When true, all mouse-driven highlighting is suppressed.
    // Engages on any keyboard navigation or on open; disengages only when
    // the mouse physically moves to a different pixel coordinate.
    private _mouseBlocked = $state(false);
    private _lastMouseX = -1;
    private _lastMouseY = -1;

    // --- Callbacks ---
    private _onSelect: (value: T) => void;
    private _onClose?: () => void;

    constructor(onSelect: (value: T) => void, onClose?: () => void) {
        this.nav = new ListNavigator<SelectOption<T>>();
        this._onSelect = onSelect;
        this._onClose = onClose;
    }

    // --- Public API ---

    open() {
        if (this.isOpen) return;

        // Singleton: close the previously active controller
        if (activeController && activeController !== this) {
            activeController.close();
        }
        activeController = this;

        this.isOpen = true;
        this._mouseBlocked = true;
        this.mouseIndex = -1;
        this._addGlobalListeners();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this._mouseBlocked = false;
        this.mouseIndex = -1;

        if (activeController === this) {
            activeController = null;
        }

        this._removeGlobalListeners();
        this._onClose?.();
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    selectOption(option: SelectOption<T>) {
        if (option.disabled) return;
        this._onSelect(option.value);
        this.close();
        this.triggerEl?.focus();
    }

    /**
     * Sets options on the navigator. Finds and highlights the option matching
     * `currentValue` if provided, otherwise resets to 0.
     */
    setOptions(options: SelectOption<T>[], currentValue?: T) {
        this.nav.setOptions(options);
        if (currentValue !== undefined) {
            const idx = options.findIndex((o) => o.value === currentValue);
            if (idx !== -1) {
                this.nav.index = idx;
            }
        }
    }

    /**
     * The effective highlighted index for rendering.
     * When the mouse is active (mouseIndex >= 0), it takes precedence.
     * Otherwise, the keyboard-driven nav.index is used.
     */
    get highlightedIndex(): number {
        return this.mouseIndex >= 0 ? this.mouseIndex : this.nav.index;
    }

    // --- Keyboard Handler ---
    // Attach this to keydown on both the trigger and any internal inputs.
    handleKeydown = (e: KeyboardEvent) => {
        const handled = handleListNavigation(e, {
            isOpen: this.isOpen,
            nav: this.nav,
            listContainer: this.listEl,
            onSelect: (item: SelectOption<T>) => this.selectOption(item),
            onClose: () => {
                this.close();
                this.triggerEl?.focus();
            },
            onOpen: () => this.open(),
            triggerElement: this.triggerEl,
        });

        if (handled) {
            // Keyboard takes over — suppress mouse and clear its highlight
            this._mouseBlocked = true;
            this.mouseIndex = -1;
        }
    };

    // --- Mouse Handling ---

    /**
     * Attach to `onmousemove` on the list container.
     * Resolves which item the cursor is over from the event target,
     * but ONLY if the mouse has physically moved since the last keyboard action.
     */
    handleMouseMove = (e: MouseEvent) => {
        // Still blocked — check if mouse has actually moved
        if (this._mouseBlocked) {
            if (
                e.clientX === this._lastMouseX &&
                e.clientY === this._lastMouseY
            ) {
                return;
            }
            // Mouse has moved — unblock
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            this._mouseBlocked = false;
        }

        // Resolve which list item the cursor is over
        const target = (e.target as HTMLElement).closest("li");
        if (!target || !this.listEl) return;

        const items = Array.from(this.listEl.children);
        const index = items.indexOf(target);
        if (index >= 0) {
            this.mouseIndex = index;
        }
    };

    /**
     * Attach to `onmouseleave` on the list container.
     * Clears the mouse highlight when the cursor exits the list.
     */
    handleMouseLeave = () => {
        this.mouseIndex = -1;
    };

    // --- Private: Global Event Management ---
    private _boundClickOutside = this._handleClickOutside.bind(this);
    private _boundScrollOutside = this._handleScrollOutside.bind(this);

    private _addGlobalListeners() {
        // Microtask delay so the click that opened doesn't immediately close
        setTimeout(() => {
            if (!this.isOpen) return;
            window.addEventListener("mousedown", this._boundClickOutside, true);
            window.addEventListener("scroll", this._boundScrollOutside, true);
        }, 0);
    }

    private _removeGlobalListeners() {
        window.removeEventListener("mousedown", this._boundClickOutside, true);
        window.removeEventListener("scroll", this._boundScrollOutside, true);
    }

    private _handleClickOutside(event: MouseEvent) {
        if (!this.isOpen) return;
        const target = event.target as Node;

        if (this.menuEl?.contains(target)) return;
        if (this.triggerEl?.contains(target)) return;

        this.close();
    }

    private _handleScrollOutside(event: Event) {
        if (!this.isOpen) return;
        const target = event.target as Node;

        if (this.menuEl?.contains(target)) return;

        this.close();
    }

    destroy() {
        this.close();
    }
}

// --- Factory ---

/**
 * Creates a SelectController and wires up the standard reactive syncing
 * ($effect for options/value, onDestroy cleanup) that every select needs.
 *
 * Call once at the top level of your component's <script> block.
 */
export function createSelectContext<T>(opts: {
    onSelect: (value: T) => void;
    onClose?: () => void;
    /** Reactive getter for the current options list */
    getOptions: () => SelectOption<T>[];
    /** Reactive getter for the currently selected value */
    getValue: () => T | undefined;
}): SelectController<T> {
    const ctrl = new SelectController<T>(opts.onSelect, opts.onClose);

    $effect(() => {
        ctrl.setOptions(opts.getOptions(), opts.getValue());
    });

    onDestroy(() => ctrl.destroy());

    return ctrl;
}
