<script lang="ts">
    import { appStatus, resetAllStores } from "$lib/viewStores";
    import { world, tags, vaultPath } from "$lib/worldStore";
    import { promptAndCreateItem } from "$lib/actions";
    import { openModal, closeModal } from "$lib/modalStore";
    import FileExplorer from "./FileExplorer.svelte";
    import TagList from "./TagList.svelte";
    import SettingsModal from "./SettingsModal.svelte";
    import HelpModal from "./HelpModal.svelte";
    import Button from "./Button.svelte";
    import SearchInput from "./SearchInput.svelte";

    let { width = $bindable() } = $props();
    let activeTab = $state<"files" | "tags">("files");
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
                onChangeVault: () => {
                    closeModal();
                    world.destroy();
                    resetAllStores();
                    appStatus.set("selecting_vault");
                },
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
            : "Search tags..."}
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
    </div>
    <div class="sidebar-content">
        {#if activeTab === "files"}
            <FileExplorer {searchTerm} />
        {:else if activeTab === "tags"}
            <TagList tags={filteredTags} />
        {/if}
    </div>

    <div class="sidebar-footer">
        <Button
            size="small"
            class="new-path-button"
            title="New Page"
            onclick={showCreateFile}
        >
            + New Page
        </Button>
        <Button
            size="small"
            class="new-path-button"
            title="New Folder"
            onclick={showCreateFolder}
        >
            + New Folder
        </Button>

        <Button variant="ghost" title="Help" onclick={showHelp}>?</Button>

        <Button variant="ghost" title="Settings" onclick={showSettings}>
            ⚙️
        </Button>
    </div>
</aside>

<style>
    aside {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        background-color: var(--color-overlay-medium);
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        z-index: 50;
    }
    .sidebar-header {
        padding: 1rem;
        text-align: center;
        border-bottom: 1px solid var(--border-color);
    }
    .title {
        font-family: var(--font-family-heading);
        margin: 0;
        font-size: 2rem;
        color: var(--ink-heading);
    }
    .tab-navigation {
        display: flex;
        border-bottom: 1px solid var(--border-color);
    }
    .tab-navigation button {
        flex: 1;
        padding: 0.75rem;
        background: none;
        border: none;
        font-size: 1rem;
        cursor: pointer;
        color: var(--ink-light);
        border-bottom: 2px solid transparent;
        font-family: var(--font-family-body);
    }
    .tab-navigation button.active {
        border-bottom-color: var(--accent-color);
        font-weight: bold;
        color: var(--ink);
    }
    .sidebar-content {
        flex-grow: 1;
        overflow-y: auto;
        padding: 1rem;
    }
    .sidebar-footer {
        padding: 0.75rem;
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
    }
    /* Use :global() to apply styles to a class passed to a child component */
    .sidebar-footer :global(.new-path-button) {
        flex-grow: 1;
    }
    .sidebar-footer {
        gap: 0.25rem;
    }
    .sidebar-footer > :global(button.ghost) {
        flex-shrink: 0;
        width: 38px; /* Give a fixed width */
        font-size: 1.2rem;
        font-weight: bold;
    }
</style>
