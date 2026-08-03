<script lang="ts">
    import type { TocEntry, Backlink } from "$lib/bindings";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { t } from "$lib/i18n";

    /** Which section a caller asked us to bring into view. */
    export type RailSection = "contents" | "backlinks";

    let {
        toc = [],
        backlinks = [],
        tags = [],
        focus = null,
        onNavigate,
        onNavigateTag,
        onClose,
    } = $props<{
        toc?: TocEntry[];
        backlinks?: Backlink[];
        tags?: string[];
        /**
         * Set to a fresh object to scroll that section into view. A new object
         * identity (rather than a flag) is what re-triggers the scroll, so
         * pressing the same header button twice works.
         */
        focus?: { section: RailSection } | null;
        onNavigate: (link: Backlink) => void;
        onNavigateTag: (tag: string) => void;
        onClose: () => void;
    }>();

    // Highlighting the clicked entry rather than scroll-spying the article:
    // the preview's scroll container is owned by FileView, and a wrong-by-a-
    // heading highlight is worse than one that simply tracks what you picked.
    let activeEntryId = $state<string | null>(null);

    // Deliberately not $state: this is a bag of bind:this refs, and making it
    // reactive would add it as a dependency of the effect below, re-running the
    // scroll on every remount. The refs are populated before user effects run,
    // so `focus` alone is the correct trigger.
    let sectionEls: Partial<Record<RailSection, HTMLElement>> = {};

    $effect(() => {
        // Annotated rather than inferred: `$props()` destructuring widens the
        // individual bindings to `any`, so without this the index below is an
        // implicit-any error under strict mode.
        const target: { section: RailSection } | null = focus;
        if (!target) return;
        sectionEls[target.section]?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
        });
    });

    function handleTocClick(entry: TocEntry) {
        activeEntryId = entry.id;
        document
            .getElementById(entry.id)
            ?.scrollIntoView({ behavior: "smooth" });
    }
</script>

<!--
  One rail instead of three separate affordances: the table of contents used to
  interrupt the article mid-read, and backlinks lived in their own panel with
  its own header and close button. Everything that describes the page rather
  than being the page now sits here.
-->
<aside class="context-rail">
    <div class="rail-close-row">
        <button
            class="icon-btn"
            onclick={onClose}
            title={$t("common.close")}
            aria-label={$t("common.close")}
        >
            <Icon type="close" />
        </button>
    </div>

    {#if toc.length > 0}
        <section bind:this={sectionEls.contents}>
            <h3 class="eyebrow">{$t("fileView.contents")}</h3>
            <nav>
                {#each toc as entry (entry.id)}
                    <button
                        class="toc-row"
                        class:active={entry.id === activeEntryId}
                        style="padding-left: calc(8px + {(entry.level - 1) *
                            14}px)"
                        onclick={() => handleTocClick(entry)}
                    >
                        <span class="toc-number">{entry.number}</span>
                        <span class="toc-text">{entry.text}</span>
                    </button>
                {/each}
            </nav>
        </section>
    {/if}

    {#if backlinks.length > 0}
        <section bind:this={sectionEls.backlinks}>
            <h3 class="eyebrow">
                {$t("backlinks.title")} · {backlinks.length}
            </h3>
            <nav>
                {#each backlinks as link (link.path)}
                    <button class="link-row" onclick={() => onNavigate(link)}>
                        <span class="link-title">{link.title}</span>
                        {#if link.count > 1}
                            <span class="link-count">{link.count}</span>
                        {/if}
                    </button>
                {/each}
            </nav>
        </section>
    {/if}

    {#if tags.length > 0}
        <section>
            <h3 class="eyebrow">{$t("sidebar.tags")}</h3>
            <div class="tag-row">
                {#each tags as tag}
                    <button
                        class="tag-pill tag-button"
                        onclick={() => onNavigateTag(tag)}
                    >
                        {tag}
                    </button>
                {/each}
            </div>
        </section>
    {/if}
</aside>

<style>
    .context-rail {
        width: 252px;
        flex-shrink: 0;
        height: 100%;
        box-sizing: border-box;
        border-left: 1px solid var(--color-border-primary);
        /* --overlay-subtle (the first choice here) moved the surface by only
           ~4/255 on the dark themes — the rail read as part of the article
           rather than as chrome beside it. --overlay-medium is the quietest
           token that actually separates on both light and dark. */
        background: var(--color-overlay-medium);
        padding: 20px 18px;
        overflow-y: auto;
    }

    /* Zero-height so it costs no vertical space, sticky so the close button
       stays reachable once a long table of contents scrolls. */
    .rail-close-row {
        position: sticky;
        top: 0;
        z-index: 1;
        height: 0;
        display: flex;
        justify-content: flex-end;
    }

    section + section {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid var(--color-border-primary);
    }

    h3 {
        margin: 0 0 10px;
    }

    nav {
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .toc-row,
    .link-row {
        display: flex;
        align-items: baseline;
        gap: 9px;
        width: 100%;
        box-sizing: border-box;
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        background: none;
        cursor: pointer;
        text-align: left;
        font-family: inherit;
        font-size: 0.84rem;
        color: var(--color-text-primary);
        transition: background-color 0.15s;
    }

    .toc-row:hover,
    .link-row:hover {
        background: var(--color-overlay-medium);
    }

    /* A marker down the leading edge, not a filled slab — the rail sits beside
       the article and a solid highlight would out-shout it. */
    .toc-row.active {
        background: color-mix(
            in srgb,
            var(--color-accent-primary) 8%,
            transparent
        );
        box-shadow: inset 2px 0 0 var(--color-accent-primary);
    }

    .toc-number,
    .link-count {
        color: var(--color-text-secondary);
        font-size: 0.76rem;
        flex-shrink: 0;
    }

    .toc-text,
    .link-title {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    .link-row {
        justify-content: space-between;
    }

    .tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .tag-button {
        cursor: pointer;
        font-family: inherit;
        font-size: 0.78rem;
    }

    .tag-button:hover {
        border-color: var(--color-accent-primary);
        color: var(--color-text-link);
    }
</style>
