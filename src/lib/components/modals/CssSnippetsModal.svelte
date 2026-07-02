<script lang="ts">
    import { onMount } from "svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import ToggleSwitch from "$lib/components/ui/ToggleSwitch.svelte";
    import { openSnippetsDir } from "$lib/commands";
    import {
        snippets,
        setEnabled as setSnippetEnabled,
        refreshSnippets,
    } from "$lib/snippetsStore";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

    let { onClose = () => {} } = $props<{
        onClose?: () => void;
    }>();

    onMount(() => {
        // Re-scan so files added to the folder while the app was open appear
        // even before a live `snippets-changed` event fires.
        refreshSnippets().catch((e) =>
            log.error("Failed to refresh CSS snippets", e, "CssSnippetsModal"),
        );
    });

    /**
     * Persist a snippet toggle. The store applies/removes the CSS and, on
     * failure (e.g. the file vanished before it could be read), rolls its own
     * state back — which snaps the toggle back to reflect reality.
     */
    async function toggleSnippet(filename: string, enabled: boolean) {
        try {
            await setSnippetEnabled(filename, enabled);
        } catch (e) {
            log.error(
                `Failed to toggle CSS snippet '${filename}'`,
                e,
                "CssSnippetsModal",
            );
        }
    }

    function handleOpenSnippetsFolder() {
        openSnippetsDir().catch((e) =>
            log.error("Failed to open snippets folder", e, "CssSnippetsModal"),
        );
    }
</script>

<Modal title={$t("snippets.title")} {onClose}>
    <div class="snippets-body">
        <p class="intro">
            {$t("snippets.intro")}
        </p>

        <div class="snippet-warning">{$t("snippets.trustWarning")}</div>

        {#if $snippets.length === 0}
            <p class="empty">
                {$t("snippets.empty")}
            </p>
        {:else}
            <div class="snippet-list">
                {#each $snippets as snippet, i (snippet.filename)}
                    <ToggleSwitch
                        id={`snippet-toggle-${i}`}
                        label={snippet.filename}
                        checked={snippet.enabled}
                        onchange={(value) =>
                            toggleSnippet(snippet.filename, value)}
                    />
                {/each}
            </div>
        {/if}

        <div class="actions">
            <Button onclick={handleOpenSnippetsFolder}>
                {$t("snippets.openFolder")}
            </Button>
        </div>
    </div>
</Modal>

<style>
    .snippets-body {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .intro {
        margin: 0;
    }
    .empty {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }
    .snippet-warning {
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-tertiary);
        color: var(--color-text-secondary);
        font-size: 0.85rem;
    }
    .snippet-list {
        display: flex;
        flex-direction: column;
    }
    .actions {
        margin-top: 0.25rem;
    }
</style>
