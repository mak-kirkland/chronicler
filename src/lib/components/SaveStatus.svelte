<script lang="ts">
    // A type alias for the possible states the save process can be in.
    type SaveStatusType = "idle" | "dirty" | "saving" | "error";

    // Props for the component: the current status and the timestamp of the last save.
    let { status, lastSaveTime } = $props<{
        status: SaveStatusType;
        lastSaveTime: Date | null;
    }>();

    /**
     * Formats a Date object into a simple HH:MM time string.
     * @param date The date to format.
     * @returns The formatted time string, or an empty string if the date is null.
     */
    function formatTime(date: Date | null): string {
        if (!date) return "";
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }
</script>

{#if status !== "idle" || lastSaveTime}
    <span class="save-status {status}">
        {#if status === "saving"}
            Saving...
        {:else if status === "error"}
            Save failed
        {:else if status === "dirty"}
            Unsaved changes
        {:else if lastSaveTime}
            Last saved at: {formatTime(lastSaveTime)}
        {/if}
    </span>
{/if}

<style>
    .save-status {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        transition: opacity 0.3s ease-in-out;
        white-space: nowrap;
    }

    .save-status.error {
        color: var(--color-text-error);
        font-weight: bold;
    }

    .save-status.dirty {
        font-style: italic;
    }
</style>
