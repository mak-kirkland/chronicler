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

    let { width = $bindable(), minWidth = $bindable(200) } = $props();
    let activeTab = $state<"files" | "tags" | "gallery" | "reports">("files");
    let searchTerm = $state("");
    let titleWidth = $state(0);

    // When the value of activeTab changes, clear the search term
    $effect(() => {
        activeTab;
        searchTerm = "";
    });

    // Dynamically calculate the minimum width based on the title's rendered size and the current font scale
    $effect(() => {
        if (titleWidth > 0) {
            // The sidebar-header has 1rem padding on each side (2rem total).
            // Calculate real pixels based on the user's root font size scale.
            const totalPadding = 32 * ($fontSize / 100);
            const buffer = 16; // extra buffer to guarantee no immediate visual touching
            minWidth = Math.ceil(titleWidth + totalPadding + buffer);

            // Auto-expand the sidebar if it is currently too small for the new font size
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
            ? "Search files..."
            : activeTab === "tags"
              ? "Search tags..."
              : activeTab === "gallery"
                ? "Search images..."
                : "Search reports..."}
    />

    <div class="tab-navigation">
        <button
            class:active={activeTab === "files"}
            onclick={() => (activeTab = "files")}
            title="Files"
        >
            <Icon type="folder" />
        </button>
        <button
            class:active={activeTab === "tags"}
            onclick={() => (activeTab = "tags")}
            title="Tags"
        >
            <Icon type="tags" />
        </button>
        <button
            class:active={activeTab === "gallery"}
            onclick={() => (activeTab = "gallery")}
            title="Image Gallery"
        >
            <Icon type="gallery" />
        </button>
        <button
            class:active={activeTab === "reports"}
            onclick={() => (activeTab = "reports")}
            title="Reports"
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
                title="New Page"
                onclick={showCreateFile}
            >
                + Page
            </Button>
            <Button
                size="small"
                class="new-path-button"
                title="New Folder"
                onclick={showCreateFolder}
            >
                + Folder
            </Button>
            {#if $hasMapsEntitlement}
                <Button
                    size="small"
                    class="new-path-button"
                    title="New Map"
                    onclick={showCreateMap}
                >
                    + Map
                </Button>
            {/if}
        </div>

        <div class="secondary-actions">
            <Button variant="ghost" title="Help" onclick={showHelp}>
                <Icon type="help" />
            </Button>
            <Button variant="ghost" title="About" onclick={showAbout}>
                <Icon type="info" />
            </Button>
            <Button variant="ghost" title="Settings" onclick={showSettings}>
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
