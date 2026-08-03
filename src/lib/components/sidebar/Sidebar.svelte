<script lang="ts">
    import { tags, vaultPath, vaultStats } from "$lib/worldStore";
    import { promptAndCreateItem } from "$lib/actions";
    import { selectNewVault, handleVaultSelected } from "$lib/startup";
    import { getRecentVaults } from "$lib/commands";
    import { log } from "$lib/logger";
    import { vaultDisplayName } from "$lib/utils";
    import { openModal, closeModal } from "$lib/modalStore";
    import MenuList from "$lib/components/ui/MenuList.svelte";
    import type { ContextMenuItem } from "$lib/types";
    import {
        hasMapsEntitlement,
        hasTimelinesEntitlement,
    } from "$lib/licenseStore";
    import { fontSize } from "$lib/settingsStore";
    import { SIDEBAR_MAX_WIDTH } from "$lib/config";
    import FileExplorer from "$lib/components/sidebar/FileExplorer.svelte";
    import TagList from "$lib/components/sidebar/TagList.svelte";
    import ReportList from "$lib/components/reports/ReportList.svelte";
    import GalleryPanel from "$lib/components/sidebar/GalleryPanel.svelte";
    import SettingsModal from "$lib/components/modals/SettingsModal.svelte";
    import HelpModal from "$lib/components/modals/HelpModal.svelte";
    import AboutModal from "$lib/components/modals/AboutModal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import SearchInput from "$lib/components/ui/SearchInput.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import NewMapModal from "$lib/components/map/NewMapModal.svelte";
    import NewCanvasModal from "$lib/components/modals/NewCanvasModal.svelte";
    import NewTimelineModal from "$lib/components/timeline/NewTimelineModal.svelte";
    import { t } from "$lib/i18n";

    let { width = $bindable(), minWidth = $bindable(200) } = $props();
    let activeTab = $state<"files" | "tags" | "gallery" | "reports">("files");
    let searchTerm = $state("");
    let titleWidth = $state(0);
    let footerNaturalWidth = $state(0);

    // The New Page split button's menu.
    let isNewMenuOpen = $state(false);
    let newMenuAnchor = $state<HTMLElement | null>(null);

    // The vault switcher's menu.
    let isVaultMenuOpen = $state(false);
    let vaultMenuAnchor = $state<HTMLElement | null>(null);
    let recentVaults = $state<string[]>([]);

    // The folder the vault lives in — the one piece of orientation the sidebar
    // never used to show.
    const vaultName = $derived($vaultPath ? vaultDisplayName($vaultPath) : "");

    // The current vault is already named on the chip, so listing it again as
    // something to switch to would just be a no-op row.
    const otherVaults = $derived(
        recentVaults.filter((p) => p !== $vaultPath).slice(0, 8),
    );

    /** Loads the recent list lazily — it's only needed once the menu opens. */
    async function openVaultMenu() {
        isVaultMenuOpen = !isVaultMenuOpen;
        if (!isVaultMenuOpen) return;
        try {
            recentVaults = await getRecentVaults();
        } catch (e) {
            log.error("Failed to load recent vaults", e, "Sidebar");
            recentVaults = [];
        }
    }

    const vaultMenuItems = $derived<ContextMenuItem[]>([
        ...(otherVaults.length > 0
            ? ([
                  { isHeading: true, label: $t("vaultSelector.openRecent") },
                  ...otherVaults.map((path: string) => ({
                      label: vaultDisplayName(path),
                      title: path,
                      icon: "folder" as const,
                      handler: () => handleVaultSelected(path),
                  })),
                  { isSeparator: true },
              ] as ContextMenuItem[])
            : []),
        {
            label: $t("vaultSelector.openFolder"),
            icon: "folderOpen",
            handler: selectNewVault,
        },
    ]);

    // When the value of activeTab changes, clear the search term
    $effect(() => {
        activeTab;
        searchTerm = "";
    });

    // Dynamically calculate the minimum width so neither the title nor the
    // footer's action row overflows the sidebar at the current font/theme.
    $effect(() => {
        if (titleWidth > 0 || footerNaturalWidth > 0) {
            const scale = $fontSize / 100;
            // .sidebar-header has 1rem padding on each side.
            const headerPadding = 32 * scale;
            // .sidebar-footer has 0.75rem padding on each side.
            const footerPadding = 24 * scale;
            const buffer = 16; // extra buffer to guarantee no immediate visual touching

            const titleNeeded = titleWidth + headerPadding;
            const footerNeeded = footerNaturalWidth + footerPadding;
            // Capped at the same maximum the drag handle enforces. This effect
            // is the only path that can widen the sidebar without the user
            // asking, so it has to answer to the same ceiling — a measurement
            // that comes back wrong should cost at most a too-wide sidebar,
            // never an unbounded one.
            minWidth = Math.min(
                SIDEBAR_MAX_WIDTH,
                Math.ceil(Math.max(titleNeeded, footerNeeded) + buffer),
            );

            // Auto-expand if too small — and pull back an oversized stored
            // width, which is otherwise sticky: it's persisted per vault and
            // nothing else here ever shrinks it.
            const clamped = Math.min(
                SIDEBAR_MAX_WIDTH,
                Math.max(minWidth, width),
            );
            if (width !== clamped) {
                width = clamped;
            }
        }
    });

    const createMenuItems = $derived<ContextMenuItem[]>([
        {
            label: $t("sidebar.newPage"),
            icon: "file",
            handler: showCreateFile,
        },
        {
            label: $t("sidebar.newFolder"),
            icon: "folder",
            handler: showCreateFolder,
        },
        {
            label: $t("sidebar.newCanvas"),
            icon: "canvas",
            handler: showCreateCanvas,
        },
        ...($hasMapsEntitlement
            ? ([
                  {
                      label: $t("sidebar.newMap"),
                      icon: "map",
                      handler: showCreateMap,
                  },
              ] as ContextMenuItem[])
            : []),
        ...($hasTimelinesEntitlement
            ? ([
                  {
                      label: $t("sidebar.newTimeline"),
                      icon: "timeline",
                      handler: showCreateTimeline,
                  },
              ] as ContextMenuItem[])
            : []),
    ]);

    function showSettings() {
        openModal({
            component: SettingsModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    function showCreateFile() {
        if ($vaultPath) {
            promptAndCreateItem("file", $vaultPath);
        }
    }

    function showCreateFolder() {
        if ($vaultPath) {
            promptAndCreateItem("folder", $vaultPath);
        }
    }

    function showCreateCanvas() {
        if (!$vaultPath) return;
        openModal({
            component: NewCanvasModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    function showCreateMap() {
        if (!$vaultPath) return;
        openModal({
            component: NewMapModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    function showCreateTimeline() {
        if (!$vaultPath) return;
        openModal({
            component: NewTimelineModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    function showHelp() {
        openModal({
            component: HelpModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    function showAbout() {
        openModal({
            component: AboutModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    const filteredTags = $derived(
        $tags.filter(([tag]) =>
            tag.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
    );
</script>

<aside style="width: {width}px;">
    <div class="sidebar-header">
        <!--
            The inline style is load-bearing: clientWidth here feeds minWidth,
            which feeds width, which sets this header's width. Measure anything
            that can stretch to its container and that becomes a loop which
            grows the sidebar until it swallows the window. inline-block is
            shrink-to-fit, so it can't.
        -->
        <h1
            class="title"
            style="display: inline-block;"
            bind:clientWidth={titleWidth}
        >
            Chronicler
        </h1>
    </div>

    <!-- Which vault is open — previously invisible anywhere in the UI. The
         chevron is a real disclosure: it lists the vaults you've opened
         before, because a control that looks like a menu should not close
         your vault the instant you click it. -->
    <div class="vault-switcher">
        <button
            class="vault-chip"
            bind:this={vaultMenuAnchor}
            onclick={openVaultMenu}
            title={$vaultPath}
            aria-haspopup="menu"
            aria-expanded={isVaultMenuOpen}
        >
            <Icon type="globe" />
            <span class="vault-name">{vaultName}</span>
            <span class="chevron" aria-hidden="true">▾</span>
        </button>

        <MenuList
            isOpen={isVaultMenuOpen}
            anchorEl={vaultMenuAnchor}
            items={vaultMenuItems}
            onClose={() => (isVaultMenuOpen = false)}
        />
    </div>

    <SearchInput
        bind:value={searchTerm}
        placeholder={activeTab === "files"
            ? $t("sidebar.searchFiles")
            : activeTab === "tags"
              ? $t("sidebar.searchTags")
              : activeTab === "gallery"
                ? $t("sidebar.searchImages")
                : $t("sidebar.searchReports")}
    />

    <div class="tab-navigation">
        <button
            class:active={activeTab === "files"}
            onclick={() => (activeTab = "files")}
            title={$t("sidebar.files")}
            aria-label={$t("sidebar.files")}
        >
            <Icon type="folder" />
        </button>
        <button
            class:active={activeTab === "tags"}
            onclick={() => (activeTab = "tags")}
            title={$t("sidebar.tags")}
            aria-label={$t("sidebar.tags")}
        >
            <Icon type="tags" />
        </button>
        <button
            class:active={activeTab === "gallery"}
            onclick={() => (activeTab = "gallery")}
            title={$t("sidebar.gallery")}
            aria-label={$t("sidebar.gallery")}
        >
            <Icon type="gallery" />
        </button>
        <button
            class:active={activeTab === "reports"}
            onclick={() => (activeTab = "reports")}
            title={$t("sidebar.reports")}
            aria-label={$t("sidebar.reports")}
        >
            <Icon type="reports" />
        </button>
    </div>
    <div class="sidebar-content">
        {#if activeTab === "files"}
            <FileExplorer {searchTerm} />
        {:else if activeTab === "tags"}
            <TagList tags={filteredTags} />
        {:else if activeTab === "gallery"}
            <GalleryPanel {searchTerm} />
        {:else if activeTab === "reports"}
            <ReportList />
        {/if}
    </div>

    <div class="sidebar-footer">
        <!-- One obvious action instead of a row of equal-weight glyphs.
             Everything else you can create lives one click deeper. -->
        <div class="split-button">
            <Button
                variant="accent"
                size="small"
                class="new-page-button"
                onclick={showCreateFile}
            >
                {$t("sidebar.newPage")}
            </Button>
            <!-- The menu anchors to the chevron rather than the whole split
                 button, and hangs from its right edge, so it opens under the
                 pointer instead of back at the far left of the button. -->
            <span class="menu-trigger" bind:this={newMenuAnchor}>
                <Button
                    variant="accent"
                    size="small"
                    class="new-menu-button"
                    title={$t("sidebar.createMore")}
                    aria-label={$t("sidebar.createMore")}
                    aria-haspopup="menu"
                    aria-expanded={isNewMenuOpen}
                    onclick={() => (isNewMenuOpen = !isNewMenuOpen)}
                >
                    ▾
                </Button>
            </span>

            <MenuList
                isOpen={isNewMenuOpen}
                anchorEl={newMenuAnchor}
                items={createMenuItems}
                width={200}
                align="end"
                onClose={() => (isNewMenuOpen = false)}
            />
        </div>

        <!--
            Off-screen mirror of the split button used to measure its intrinsic
            width (without flex-grow stretching). Drives the dynamic sidebar
            min-width above.
        -->
        <div
            class="split-button footer-measure"
            aria-hidden="true"
            bind:clientWidth={footerNaturalWidth}
        >
            <Button variant="accent" size="small" class="new-page-button">
                {$t("sidebar.newPage")}
            </Button>
            <Button variant="accent" size="small" class="new-menu-button">
                ▾
            </Button>
        </div>

        <div class="footer-row">
            <span class="vault-counts">
                {$t("sidebar.pageCount", { count: $vaultStats.pages })} ·
                {$t("sidebar.folderCount", { count: $vaultStats.folders })}
            </span>
            <div class="secondary-actions">
                <button
                    class="icon-btn"
                    title={$t("help.title")}
                    aria-label={$t("help.title")}
                    onclick={showHelp}
                >
                    <Icon type="help" />
                </button>
                <button
                    class="icon-btn"
                    title={$t("sidebar.about")}
                    aria-label={$t("sidebar.about")}
                    onclick={showAbout}
                >
                    <Icon type="info" />
                </button>
                <button
                    class="icon-btn"
                    title={$t("settings.title")}
                    aria-label={$t("settings.title")}
                    onclick={showSettings}
                >
                    <Icon type="settings" />
                </button>
            </div>
        </div>
    </div>
</aside>

<style>
    aside {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        background-color: var(--color-overlay-medium);
        border-right: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        z-index: 50;
    }
    .sidebar-header {
        padding: 1rem;
        flex-shrink: 0;
        text-align: center;
        border-bottom: 1px solid var(--color-border-primary);
        /* minWidth is capped at SIDEBAR_MAX_WIDTH, so a wide heading font at
           140% can want more room than the sidebar is allowed to give. Clip
           here rather than letting the wordmark paint over the page. Safe for
           the measurement: it doesn't change the inline-block child's
           max-content width. */
        overflow: hidden;
    }
    .title {
        font-family: var(--font-family-heading);
        margin: 0;
        font-size: 2rem;
        color: var(--color-text-heading);
        /* Keeps clientWidth equal to max-content, which the sidebar's
           minimum-width calculation depends on. */
        white-space: nowrap;
    }

    .vault-switcher {
        position: relative;
    }
    .vault-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        width: calc(100% - 24px);
        margin: 10px 12px 0;
        padding: 6px 9px;
        box-sizing: border-box;
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: 0.86rem;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.15s;
    }
    .vault-chip:hover {
        border-color: var(--color-accent-primary);
    }
    .vault-name {
        flex-grow: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .chevron {
        color: var(--color-text-secondary);
        font-size: 0.7rem;
        flex-shrink: 0;
    }

    .tab-navigation {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        padding: 8px 10px;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .tab-navigation button {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        padding: 9px 2px;
        background: none;
        border: 1px solid transparent;
        border-radius: 5px;
        font-size: 1.2em;
        cursor: pointer;
        color: var(--color-text-secondary);
        font-family: var(--font-family-body);
        transition:
            color 0.2s,
            background-color 0.2s;
    }
    .tab-navigation button:hover {
        background-color: var(--color-background-secondary);
    }
    .tab-navigation button.active {
        background-color: var(--color-background-primary);
        border-color: var(--color-border-primary);
        box-shadow: inset 0 -2px 0 var(--color-accent-primary);
        color: var(--color-text-primary);
    }
    .sidebar-content {
        flex-grow: 1;
        overflow-y: auto;
        padding: 0.5rem 0 0.5rem 0;
    }
    .sidebar-footer {
        padding: 0.6rem 0.75rem;
        border-top: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    /* One control, two targets: the wide half creates a page, the 34px half
       opens the menu. The seam between them is a single hairline, so it still
       reads as one button. */
    .split-button {
        display: flex;
        position: relative;
    }
    .split-button :global(.new-page-button) {
        flex-grow: 1;
        min-width: 0;
        border-radius: 6px 0 0 6px;
    }
    .menu-trigger {
        display: flex;
        flex-shrink: 0;
    }
    .split-button :global(.new-menu-button) {
        width: 34px;
        flex-shrink: 0;
        padding-left: 0;
        padding-right: 0;
        border-radius: 0 6px 6px 0;
    }
    /* The seam. Repeated for :hover so it survives the accent variant's hover
       rule, which recolours every border side. */
    .split-button :global(.new-menu-button),
    .split-button :global(.new-menu-button:hover) {
        border-left-color: var(--color-background-primary);
    }

    /* Wears .split-button so the same :global rules size it as the real
       control — otherwise a tweak to the chevron's width silently changes the
       sidebar's minimum. width: max-content overrides the flex-grow on the
       wide half, so this measures intrinsic width rather than stretching. */
    .footer-measure {
        position: absolute;
        visibility: hidden;
        pointer-events: none;
        top: -9999px;
        left: -9999px;
        width: max-content;
    }

    .footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .vault-counts {
        font-size: 0.72rem;
        color: var(--color-text-secondary);
        opacity: 0.8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }

    .secondary-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }
</style>
