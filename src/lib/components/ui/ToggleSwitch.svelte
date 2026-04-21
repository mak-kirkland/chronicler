<!--
    ToggleSwitch.svelte

    A reusable toggle switch component for boolean settings.
    Extracted from InfoboxSettingsModal to provide a consistent toggle
    style across the application (settings modals, map settings, etc.).

    Usage:
        <ToggleSwitch id="my-toggle" label="Enable Feature" bind:checked={myValue} />
        <ToggleSwitch id="detail-toggle" label="Show Details" description="Displays additional metadata." bind:checked={showDetails} />
-->
<script lang="ts">
    let {
        id,
        label,
        description = "",
        checked = $bindable(false),
        disabled = false,
    } = $props<{
        /** A unique ID for the underlying <input>, used for accessibility. */
        id: string;
        /** The primary label displayed next to the toggle. */
        label: string;
        /** Optional secondary description shown below the label. */
        description?: string;
        /** The bound boolean state of the toggle. */
        checked?: boolean;
        /** If true, the toggle is non-interactive and visually dimmed. */
        disabled?: boolean;
    }>();
</script>

<div class="setting-item">
    <div class="setting-control-row">
        <div class="label-group">
            <label for={id}>{label}</label>
            {#if description}
                <p class="setting-description">{description}</p>
            {/if}
        </div>
        <label class="toggle-switch" class:disabled>
            <input type="checkbox" {id} bind:checked {disabled} />
            <span class="slider"></span>
        </label>
    </div>
</div>

<style>
    .setting-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .setting-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .setting-control-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .label-group {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }

    .label-group label {
        font-weight: 600;
        color: var(--color-text-primary);
    }

    .setting-description {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }

    /* --- Toggle Switch Styles --- */
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
    }

    .toggle-switch.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--color-background-tertiary);
        transition: 0.2s;
        border-radius: 24px;
        border: 1px solid var(--color-border-primary);
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 2px;
        background-color: white;
        transition: 0.2s;
        border-radius: 50%;
    }

    input:checked + .slider {
        background-color: var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }

    input:focus-visible + .slider {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
    }

    input:checked + .slider:before {
        transform: translateX(19px);
    }

    .disabled .slider {
        cursor: not-allowed;
    }
</style>
