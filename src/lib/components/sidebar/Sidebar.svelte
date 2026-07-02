<script lang="ts">
    import { tags, vaultPath } from "$lib/worldStore";
    import { promptAndCreateItem } from "$lib/actions";
    import { openModal, closeModal } from "$lib/modalStore";
    import { hasMapsEntitlement } from "$lib/licenseStore";
    import { fontSize } from "$lib/settingsStore";
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
    import { t } from "$lib/i18n";

    let { width = $bindable(), minWidth = $bindable(200) } = $props();
    let activeTab = $state<"files" | "tags" | "gallery" | "reports">("files");
    let searchTerm = $state("");
    let titleWidth = $state(0);
    let footerNaturalWidth = $state(0);

    // When the value of activeTab changes, clear the search term
    $effect(() => {
        activeTab;
        searchTerm = "";
    });

    // Dynamically calculate the minimum width so neither the title nor the
    // footer button row overflows the sidebar at the current font/theme.
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
            minWidth = Math.ceil(Math.max(titleNeeded, footerNeeded) + buffer);

            // Auto-expand the sidebar if it is currently too small
            if (width < minWidth) {
                width = minWidth;
            }
        }
    });

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

    function showCreateMap() {
        if (!$vaultPath) return;
        openModal({
            component: NewMapModal,
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
        <!-- display: inline-block is required so clientWidth measures text, not the container -->
        <h1
            class="title"
            style="display: inline-block;"
            bind:clientWidth={titleWidth}
        >
            Chronicler
        </h1>
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
        >
            <Icon type="folder" />
        </button>
        <button
            class:active={activeTab === "tags"}
            onclick={() => (activeTab = "tags")}
            title={$t("sidebar.tags")}
        >
            <Icon type="tags" />
        </button>
        <button
            class:active={activeTab === "gallery"}
            onclick={() => (activeTab = "gallery")}
            title={$t("sidebar.gallery")}
        >
            <Icon type="gallery" />
        </button>
        <button
            class:active={activeTab === "reports"}
            onclick={() => (activeTab = "reports")}
            title={$t("sidebar.reports")}
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
        <div class="primary-actions">
            <Button
                size="small"
                class="new-path-button"
                title={$t("sidebar.newPage")}
                onclick={showCreateFile}
            >
                + <Icon type="file" />
            </Button>
            <Button
                size="small"
                class="new-path-button"
                title={$t("sidebar.newFolder")}
                onclick={showCreateFolder}
            >
                + <Icon type="folder" />
            </Button>
            {#if $hasMapsEntitlement}
                <Button
                    size="small"
                    class="new-path-button"
                    title={$t("sidebar.newMap")}
                    onclick={showCreateMap}
                >
                    + <Icon type="map" />
                </Button>
            {/if}
        </div>

        <!--
            Off-screen mirror of the primary action buttons used to measure
            their intrinsic combined width (without flex-grow stretching).
            Drives the dynamic sidebar min-width above.
        -->
        <div
            class="footer-measure"
            aria-hidden="true"
            bind:clientWidth={footerNaturalWidth}
        >
            <Button size="small">+ <Icon type="file" /></Button>
            <Button size="small">+ <Icon type="folder" /></Button>
            {#if $hasMapsEntitlement}
                <Button size="small">+ <Icon type="map" /></Button>
            {/if}
        </div>

        <div class="secondary-actions">
            <Button variant="ghost" title={$t("help.title")} onclick={showHelp}>
                <Icon type="help" />
            </Button>
            <Button
                variant="ghost"
                title={$t("sidebar.about")}
                onclick={showAbout}
            >
                <Icon type="info" />
            </Button>
            <Button
                variant="ghost"
                title={$t("settings.title")}
                onclick={showSettings}
            >
                <Icon type="settings" />
            </Button>
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
        text-align: center;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .title {
        font-family: var(--font-family-heading);
        margin: 0;
        font-size: 2rem;
        color: var(--color-text-heading);
    }
    .tab-navigation {
        display: flex;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .tab-navigation button {
        flex: 1;
        padding: 0.75rem 0.2rem;
        background: none;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        color: var(--color-text-secondary);
        border-bottom: 3px solid transparent;
        font-family: var(--font-family-body);
        transition:
            color 0.2s,
            background-color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .tab-navigation button:hover {
        background-color: var(--color-background-secondary);
    }
    .tab-navigation button.active {
        border-bottom-color: var(--color-accent-primary);
        color: var(--color-text-primary);
        background-color: var(--color-overlay-light);
    }
    .sidebar-content {
        flex-grow: 1;
        overflow-y: auto;
        padding: 0.5rem 0 0.5rem 0;
    }
    .sidebar-footer {
        padding: 0.5rem 0.75rem 0.2rem;
        border-top: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .primary-actions {
        display: flex;
        gap: 0.5rem;
    }

    .primary-actions :global(.new-path-button) {
        flex-grow: 1;
    }

    .footer-measure {
        position: absolute;
        visibility: hidden;
        pointer-events: none;
        top: -9999px;
        left: -9999px;
        display: flex;
        gap: 0.5rem;
        width: max-content;
    }

    .secondary-actions {
        display: flex;
        justify-content: space-between;
        border-top: 1px solid var(--color-border-primary);
        padding-top: 0.2rem;
    }

    .secondary-actions > :global(button.ghost) {
        flex-grow: 1;
        font-size: 1.1rem;
        font-weight: bold;
    }
</style>
