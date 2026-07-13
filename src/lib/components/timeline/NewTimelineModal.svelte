<script lang="ts">
    import { vaultPath, world, files } from "$lib/worldStore";
    import { writePageContent } from "$lib/commands";
    import { navigateToTimeline } from "$lib/actions";
    import { registerTimeline } from "$lib/timelineStore";
    import { emptyTimeline } from "$lib/timelineModels";
    import {
        allCalendarChoices,
        loadVaultCalendars,
        vaultCalendars,
    } from "$lib/calendarStore";
    import { join } from "@tauri-apps/api/path";
    import { autofocus } from "$lib/domActions";
    import { normalizePath, findNodeByPath } from "$lib/utils";
    import Button from "$lib/components/ui/Button.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import CalendarEditorModal from "./CalendarEditorModal.svelte";
    import { openModal, popModal } from "$lib/modalStore";
    import type { CalendarDef } from "$lib/calendarModels";
    import { log } from "$lib/logger";
    import { t, translate } from "$lib/i18n";

    let { onClose, parentDir } = $props<{
        onClose: () => void;
        parentDir?: string;
    }>();

    let name = $state("");
    let calendarId = $state("gregorian");
    let isCreating = $state(false);

    // Depend on the store so choices refresh after loading.
    const choices = $derived.by(() => {
        void $vaultCalendars;
        return allCalendarChoices();
    });
    $effect(() => {
        loadVaultCalendars();
    });

    async function handleSubmit(event?: Event) {
        if (event) event.preventDefault();
        const dir = parentDir ?? $vaultPath;
        if (!name.trim() || !dir) return;
        isCreating = true;
        try {
            const filename = `${name.trim()}.timeline`;
            const filePath = await join(dir, filename);
            const normalizedPath = normalizePath(filePath);
            // writePageContent overwrites, so guard against clobbering an
            // existing timeline with an empty one.
            if (findNodeByPath($files, normalizedPath)) {
                alert(
                    translate("timeline.alreadyExists", { name: name.trim() }),
                );
                return;
            }
            const data = emptyTimeline(name.trim(), calendarId);
            await writePageContent(
                normalizedPath,
                JSON.stringify(data, null, 2),
            );
            registerTimeline(normalizedPath, data);
            await world.initialize();
            onClose();
            navigateToTimeline({ title: name.trim(), path: normalizedPath });
        } catch (e) {
            log.error("Failed to create timeline", e, "NewTimelineModal");
            alert(translate("timeline.createFailed"));
        } finally {
            isCreating = false;
        }
    }
</script>

<Modal title={$t("timeline.newTitle")} {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <div class="form-group">
            <label for="timeline-name">{$t("timeline.nameLabel")}</label>
            <input
                id="timeline-name"
                type="text"
                bind:value={name}
                use:autofocus
                placeholder={$t("timeline.namePlaceholder")}
            />
        </div>
        <div class="form-group">
            <label for="timeline-calendar">
                {$t("timeline.calendarLabel")}
            </label>
            <select id="timeline-calendar" bind:value={calendarId}>
                {#each choices as c (c.id)}
                    <option value={c.id}>{c.name}</option>
                {/each}
            </select>
            <Button
                type="button"
                variant="ghost"
                class="text-btn new-calendar-btn"
                onclick={() =>
                    openModal({
                        component: CalendarEditorModal,
                        props: {
                            onSaved: (def: CalendarDef) =>
                                (calendarId = def.id),
                            // Pop back to this (still-stacked) modal.
                            onClose: popModal,
                        },
                    })}>{$t("timeline.newCalendarOption")}</Button
            >
        </div>
        <div class="modal-actions">
            <Button
                type="button"
                variant="ghost"
                class="text-btn"
                onclick={onClose}>{$t("common.cancel")}</Button
            >
            <Button type="submit" disabled={!name.trim() || isCreating}>
                {isCreating ? $t("timeline.creating") : $t("timeline.create")}
            </Button>
        </div>
    </form>
</Modal>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    label {
        font-weight: bold;
        color: var(--color-text-secondary);
    }
    input,
    select {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    input:focus,
    select:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 0.5rem;
        margin-top: 1rem;
    }
    /* The ghost variant is sized for icon glyphs (1.5rem); these are text
       actions, so pin them to the normal control size. */
    .form :global(.text-btn) {
        font-size: 0.95rem;
        padding: 0.4rem 0.8rem;
    }
    .form :global(.new-calendar-btn) {
        align-self: flex-start;
        padding-left: 0;
    }
</style>
