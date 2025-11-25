<script lang="ts">
    import { tags, vaultPath } from "$lib/worldStore";
    import { promptAndCreateItem } from "$lib/actions";
    import { openModal, closeModal } from "$lib/modalStore";
    import FileExplorer from "./FileExplorer.svelte";
    import TagList from "./TagList.svelte";
    import ReportList from "./ReportList.svelte";
    import SettingsModal from "./SettingsModal.svelte";
    import HelpModal from "./HelpModal.svelte";
    import AboutModal from "./AboutModal.svelte";
    import Button from "./Button.svelte";
    import SearchInput from "./SearchInput.svelte";

    let { width = $bindable() } = $props();
    let activeTab = $state<"files" | "tags" | "reports">("files");
    let searchTerm = $state("");

    // When the value of activTab changes, clear the search term
    $effect(() => {
        activeTab;
        searchTerm = "";
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
        <h1 class="title">Chronicler</h1>
    </div>

    <SearchInput
        bind:value={searchTerm}
        placeholder={activeTab === "files"
            ? "Search files..."
            : activeTab === "tags"
              ? "Search tags..."
              : "Search reports..."}
    />

    <div class="tab-navigation">
        <button
            class:active={activeTab === "files"}
            onclick={() => (activeTab = "files")}
        >
            Files
        </button>
        <button
            class:active={activeTab === "tags"}
            onclick={() => (activeTab = "tags")}
        >
            Tags
        </button>
        <button
            class:active={activeTab === "reports"}
            onclick={() => (activeTab = "reports")}
        >
            Reports
        </button>
    </div>
    <div class="sidebar-content">
        {#if activeTab === "files"}
            <FileExplorer {searchTerm} />
        {:else if activeTab === "tags"}
            <TagList tags={filteredTags} />
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
        </div>

        <div class="secondary-actions">
            <Button variant="ghost" title="Help" onclick={showHelp}>?</Button>
            <Button variant="ghost" title="About" onclick={showAbout}>ℹ</Button>
            <Button variant="ghost" title="Settings" onclick={showSettings}
                >⚙️</Button
            >
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
        padding: 0.75rem;
        background: none;
        border: none;
        font-size: 1rem;
        cursor: pointer;
        color: var(--color-text-secondary);
        border-bottom: 2px solid transparent;
        font-family: var(--font-family-body);
    }
    .tab-navigation button.active {
        border-bottom-color: var(--color-accent-primary);
        font-weight: bold;
        color: var(--color-text-primary);
    }
    .sidebar-content {
        flex-grow: 1;
        overflow-y: auto;
        padding: 1rem 0 1rem 1rem;
    }
    .sidebar-footer {
        padding: 0.5rem 0.75rem 0.25rem;
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
        padding-top: 0.25rem;
    }

    .secondary-actions > :global(button.ghost) {
        flex-grow: 1;
        font-size: 1.1rem;
        font-weight: bold;
    }
</style>
