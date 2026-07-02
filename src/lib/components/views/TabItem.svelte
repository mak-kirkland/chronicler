<script module lang="ts">
    /** i18n keys per report view name (translate with `$t`). */
    const REPORT_LABELS: Record<string, string> = {
        "broken-links": "reports.brokenLinks",
        "broken-images": "reports.brokenImages",
        "parse-errors": "reports.parseErrors",
    };
</script>

<script lang="ts">
    import type { Tab, SaveStatus } from "$lib/viewStores";
    import { currentViewOf } from "$lib/tabs";
    import Icon from "$lib/components/ui/Icon.svelte";
    import type { IconType } from "$lib/icons";
    import { t } from "$lib/i18n";

    let {
        tab,
        active,
        displayed = false,
        status,
        onActivate,
        onClose,
        onContextMenu,
    } = $props<{
        tab: Tab;
        active: boolean;
        /** Shown in the other (non-focused) pane of a split. */
        displayed?: boolean;
        status: SaveStatus | undefined;
        onActivate: () => void;
        onClose: () => void;
        onContextMenu: (e: MouseEvent) => void;
    }>();

    const view = $derived(currentViewOf(tab));

    const title = $derived.by(() => {
        const v = view;
        switch (v.type) {
            case "file":
            case "image":
            case "map":
                return v.data?.title ?? $t("tabs.untitled");
            case "tag":
                return `#${v.tagName}`;
            case "report": {
                const key = REPORT_LABELS[v.name];
                return key ? $t(key) : v.name;
            }
            default:
                return $t("tabs.welcome");
        }
    });

    const icon = $derived.by((): IconType => {
        switch (view.type) {
            case "image":
                return "image";
            case "map":
                return "globe";
            case "tag":
                return "tags";
            case "report":
                return "reports";
            case "welcome":
                return "info";
            default:
                return "file";
        }
    });

    const dirty = $derived(
        status === "dirty" || status === "saving" || status === "error",
    );

    function handleAuxClick(e: MouseEvent) {
        if (e.button === 1) {
            e.preventDefault();
            onClose();
        }
    }
</script>

<div
    class="tab"
    class:active
    class:displayed
    role="tab"
    tabindex="0"
    aria-selected={active}
    {title}
    onclick={onActivate}
    onkeydown={(e) => (e.key === "Enter" || e.key === " ") && onActivate()}
    onauxclick={handleAuxClick}
    oncontextmenu={onContextMenu}
>
    <Icon type={icon} />
    <span class="tab-title">{title}</span>
    {#if dirty}
        <span class="dirty-dot" title={$t("save.unsaved")}></span>
    {/if}
    <button
        class="close-btn"
        title={$t("tabs.closeTab")}
        onclick={(e) => {
            e.stopPropagation();
            onClose();
        }}
    >
        <Icon type="close" />
    </button>
</div>

<style>
    .tab {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0 0.5rem 0 0.75rem;
        height: 100%;
        max-width: 200px;
        min-width: 120px;
        border-right: 1px solid var(--color-border-primary);
        cursor: pointer;
        user-select: none;
        color: var(--color-text-secondary);
        background: transparent;
        flex-shrink: 0;
    }
    .tab:hover {
        background: var(--color-background-secondary);
    }
    .tab.active {
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        box-shadow: inset 0 -2px 0 var(--color-accent-primary);
    }
    /* The other pane of a split: shown but not focused — a dimmer underline. */
    .tab.displayed:not(.active) {
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        box-shadow: inset 0 -2px 0 var(--color-border-primary);
    }
    .tab-title {
        flex-grow: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.9rem;
    }
    .dirty-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-accent-primary);
        flex-shrink: 0;
    }
    .close-btn {
        display: flex;
        align-items: center;
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 2px;
        border-radius: 3px;
        opacity: 0.6;
        flex-shrink: 0;
    }
    .close-btn:hover {
        opacity: 1;
        background: var(--color-background-tertiary);
    }
</style>
