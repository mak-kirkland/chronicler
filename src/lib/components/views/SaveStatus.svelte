<script lang="ts">
    import { t } from "$lib/i18n";

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

<!--
  A dot and a line of text, not a chip. At a glance the dot's colour carries the
  state, so the wording only has to confirm it. The pill it used to sit in gave
  a passive status the same visual weight as a button — the one thing in the bar
  you can't act on was the thing drawing a filled shape around itself.
-->
{#if status !== "idle" || lastSaveTime}
    <span class="save-status {status}">
        <span class="dot" aria-hidden="true"></span>
        <span class="label">
            {#if status === "saving"}
                {$t("save.saving")}
            {:else if status === "error"}
                {$t("save.failed")}
            {:else if status === "dirty"}
                {$t("save.unsaved")}
            {:else if lastSaveTime}
                {$t("save.savedAt", { time: formatTime(lastSaveTime) })}
            {/if}
        </span>
    </span>
{/if}

<style>
    .save-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.72rem;
        white-space: nowrap;
        color: var(--color-text-secondary);
        transition: color 0.2s ease-in-out;
    }

    .dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        flex-shrink: 0;
        background: currentColor;
    }

    /* Unsaved and in-flight share one look — both mean "not on disk yet". */
    .save-status.dirty,
    .save-status.saving {
        color: var(--color-accent-primary);
    }

    .save-status.error {
        color: var(--color-text-error);
        font-weight: bold;
    }
</style>
