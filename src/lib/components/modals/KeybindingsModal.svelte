<script lang="ts">
    /**
     * Keyboard Shortcuts modal. Lists every shortcut grouped by source, lets the
     * user rebind the editable ones via click-to-record, and shows CodeMirror's
     * built-in keys as a read-only reference.
     *
     * This component owns the single window-level capture listener used while
     * recording. Putting the state machine here (rather than per-row) guarantees
     * only one capture is ever active and keeps the rows presentational.
     */
    import { onDestroy } from "svelte";
    import { get } from "svelte/store";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import KeybindingRow from "$lib/components/modals/KeybindingRow.svelte";
    import {
        KEYBINDING_REGISTRY,
        type BindingCategory,
    } from "$lib/keybindingRegistry";
    import {
        effectiveBindings,
        customBindings,
        isCapturing,
        setBinding,
        resetBinding,
        resetAll,
        findConflict,
        findBuiltinClash,
    } from "$lib/keybindingStore";
    import {
        eventToCombo,
        isModifierOnly,
        formatCombo,
    } from "$lib/keybindingUtils";

    let { onClose = () => {} } = $props<{ onClose?: () => void }>();

    const GROUPS: { category: BindingCategory; title: string }[] = [
        { category: "navigation", title: "Navigation & Tabs" },
        { category: "editor", title: "Editor" },
        {
            category: "editor-builtin",
            title: "Built-in editor keys (read-only)",
        },
    ];

    let search = $state("");
    let recordingId = $state<string | null>(null);
    let conflictMsg = $state<string | null>(null);
    // Persistent soft-warnings ("this is normally Undo"), keyed by action id.
    let warnings = $state<Record<string, string>>({});

    function matchesSearch(label: string, note: string, keys: string[]) {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const hay = [label, note, ...keys.map((c) => formatCombo(c))]
            .join(" ")
            .toLowerCase();
        return hay.includes(q);
    }

    function rowsFor(category: BindingCategory) {
        const eff = $effectiveBindings;
        return KEYBINDING_REGISTRY.filter(
            (d) =>
                d.category === category &&
                matchesSearch(d.label, d.note ?? "", eff[d.id] ?? []),
        );
    }

    function onCapture(event: KeyboardEvent) {
        event.preventDefault();
        event.stopPropagation();
        if (!recordingId) return;

        if (event.key === "Escape") {
            stopRecording();
            return;
        }
        // Wait for a non-modifier key before resolving the combo.
        if (isModifierOnly(event)) return;

        const combo = eventToCombo(event);

        const conflict = findConflict(combo, recordingId);
        if (conflict) {
            // Block: keep recording until the user picks a free combo or bails.
            conflictMsg = `Already used by “${conflict.label}”`;
            return;
        }

        const clash = findBuiltinClash(combo);
        const id = recordingId;
        if (clash) {
            warnings = { ...warnings, [id]: `Normally “${clash.label}”` };
        } else {
            clearWarning(id);
        }

        setBinding(id, [combo]);
        stopRecording();
    }

    function startRecording(id: string) {
        // Tear down any in-progress capture before starting a new one.
        if (recordingId) stopRecording();
        recordingId = id;
        conflictMsg = null;
        isCapturing.set(true);
        window.addEventListener("keydown", onCapture, true);
    }

    function stopRecording() {
        recordingId = null;
        conflictMsg = null;
        isCapturing.set(false);
        window.removeEventListener("keydown", onCapture, true);
    }

    // Removes one entry from the persistent soft-warning map (reassigning the
    // object so Svelte tracks the change). Shared by capture and reset.
    function clearWarning(id: string) {
        if (!(id in warnings)) return;
        const next = { ...warnings };
        delete next[id];
        warnings = next;
    }

    function handleReset(id: string) {
        resetBinding(id);
        clearWarning(id);
    }

    function handleResetAll() {
        resetAll();
        warnings = {};
    }

    const hasOverrides = $derived(Object.keys($customBindings).length > 0);

    // Safety net: never leave the global capture flag stuck on if the modal is
    // dismissed (Escape/backdrop) while a recording is in progress.
    onDestroy(() => {
        if (get(isCapturing)) stopRecording();
    });
</script>

<Modal title="Keyboard Shortcuts" {onClose} wide>
    <div class="kb-body">
        <input
            class="kb-search"
            type="text"
            placeholder="Search shortcuts…"
            bind:value={search}
        />

        {#each GROUPS as group}
            {@const rows = rowsFor(group.category)}
            {#if rows.length > 0}
                <section class="kb-group">
                    <h4 class="kb-group-title">{group.title}</h4>
                    {#each rows as def (def.id)}
                        <KeybindingRow
                            {def}
                            keys={$effectiveBindings[def.id] ?? []}
                            isRecording={recordingId === def.id}
                            isOverridden={def.id in $customBindings}
                            conflict={recordingId === def.id
                                ? conflictMsg
                                : null}
                            warn={warnings[def.id] ?? null}
                            onStartRecord={startRecording}
                            onReset={handleReset}
                        />
                    {/each}
                </section>
            {/if}
        {/each}

        <p class="kb-footnote">
            Mouse back/forward buttons and tab-jump (1–9) aren't rebindable.
            Press Esc while recording to cancel.
        </p>
    </div>

    <div class="kb-actions">
        <Button
            variant="ghost"
            onclick={handleResetAll}
            disabled={!hasOverrides}
        >
            Reset all to defaults
        </Button>
    </div>
</Modal>

<style>
    .kb-body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .kb-search {
        width: 100%;
        box-sizing: border-box;
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        font-family: inherit;
        font-size: 0.95rem;
        margin-bottom: 0.5rem;
    }
    .kb-search:focus {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: -1px;
        border-color: var(--color-accent-primary);
    }
    .kb-group {
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--color-border-primary);
        margin-bottom: 0.5rem;
    }
    .kb-group:last-of-type {
        border-bottom: none;
    }
    .kb-group-title {
        margin: 0.5rem 0 0.25rem;
        font-size: 0.78rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--color-text-secondary);
    }
    .kb-footnote {
        font-size: 0.8rem;
        font-style: italic;
        color: var(--color-text-secondary);
        margin: 0.5rem 0 0;
    }
    .kb-actions {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border-primary);
        display: flex;
        justify-content: flex-end;
    }
</style>
