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
        first = false,
        afterActive = false,
        status,
        onActivate,
        onClose,
        onContextMenu,
    } = $props<{
        tab: Tab;
        active: boolean;
        /** Shown in one of the split's panes. Styled only when not `active`. */
        displayed?: boolean;
        /** Leftmost tab: nothing to its left to separate it from. */
        first?: boolean;
        /** Immediately right of the active tab, whose edge draws no rule. */
        afterActive?: boolean;
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
            case "canvas":
                return (
                    v.data?.title.replace(/\.canvas$/i, "") ??
                    $t("tabs.untitled")
                );
            case "timeline":
                return (
                    v.data?.title.replace(/\.timeline$/i, "") ??
                    $t("tabs.untitled")
                );
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
            case "canvas":
                return "canvas";
            case "timeline":
                return "timeline";
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
    class:first
    class:after-active={afterActive}
    class:dirty
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
    /* A leading rule rather than a trailing one. `border-right` put a hard line
       against the active tab's right edge and doubled up with the next tab's
       own edge; a `border-left` skipped on the first tab draws each seam once
       and never touches the active tab, which its fill and underline already
       separate. */
    .tab {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0 0.5rem 0 0.75rem;
        height: 100%;
        max-width: 200px;
        min-width: 120px;
        border-left: 1px solid var(--hairline-soft);
        cursor: pointer;
        user-select: none;
        color: var(--color-text-secondary);
        background: transparent;
        flex-shrink: 0;
    }
    .tab.first,
    .tab.active,
    .tab.after-active {
        border-left-color: transparent;
    }
    .tab:hover {
        background: var(--color-background-secondary);
    }
    /* On-screen tabs lift out of the strip; the underline says which of them
       has focus. `:not(.active)` is load-bearing — without it the split rule
       would win on source order and dim the focused tab's underline too. */
    .tab.active,
    .tab.displayed {
        background: var(--color-background-primary);
        color: var(--color-text-primary);
    }
    .tab.active {
        box-shadow: inset 0 -2px 0 var(--color-accent-primary);
    }
    .tab.displayed:not(.active) {
        box-shadow: inset 0 -2px 0 var(--color-border-primary);
    }
    .tab-title {
        flex-grow: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 0.9rem;
    }
    /* The dot takes the close button's place rather than sitting beside it —
       two glyphs in the trailing slot made every unsaved tab look busier than
       it is. Hovering swaps it back for the X, which is when you want one. */
    .dirty-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--color-accent-primary);
        flex-shrink: 0;
    }
    .tab.dirty:hover .dirty-dot {
        display: none;
    }
    .tab.dirty .close-btn {
        display: none;
    }
    .tab.dirty:hover .close-btn {
        display: flex;
    }
    /* Hidden until you're actually pointed at the tab, or it's the one you're
       working in. A row of X's is visual noise you never asked for. Kept in
       the layout (not display:none) so revealing it doesn't shift the title. */
    .close-btn {
        display: flex;
        align-items: center;
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 2px;
        border-radius: 3px;
        opacity: 0;
        flex-shrink: 0;
        transition: opacity 0.15s;
    }
    .tab:hover .close-btn,
    .tab.active .close-btn,
    .close-btn:focus-visible {
        opacity: 0.7;
    }
    .close-btn:hover {
        opacity: 1;
        background: var(--color-background-tertiary);
    }
</style>
