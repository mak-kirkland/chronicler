<script lang="ts">
    import { rightSidebar, currentView } from "$lib/viewStores";
    import type { Backlink } from "$lib/bindings";
    import Icon from "./Icon.svelte";

    function handleLinkClick(file: Backlink) {
        // When a backlink is clicked, navigate to that file.
        // We need to convert the Backlink to a PageHeader for navigation.
        currentView.set({
            type: "file",
            data: { title: file.title, path: file.path },
        });
    }

    function closePanel() {
        rightSidebar.update((state) => ({ ...state, isVisible: false }));
    }
</script>

<aside class="right-sidebar">
    <div class="sidebar-header">
        <h3>Backlinks</h3>
        <button class="close-btn" onclick={closePanel} title="Close Panel">
            <Icon type="close" />
        </button>
    </div>
    <div class="sidebar-content">
        {#if $rightSidebar.backlinks.length > 0}
            <ul>
                {#each $rightSidebar.backlinks as link (link.path)}
                    <li>
                        <button
                            class="link-button"
                            onclick={() => handleLinkClick(link)}
                        >
                            <span>{link.title}</span>
                            {#if link.count > 1}
                                <span class="reference-count"
                                    >({link.count})</span
                                >
                            {/if}
                        </button>
                    </li>
                {/each}
            </ul>
        {:else}
            <p class="text-muted">No backlinks found for this page.</p>
        {/if}
    </div>
</aside>

<style>
    .right-sidebar {
        width: 200px; /* Fixed width for the right sidebar */
        height: 100%;
        background-color: var(--color-overlay-light);
        border-left: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        flex-shrink: 0; /* Prevent the sidebar from shrinking */
    }
    .sidebar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    h3 {
        margin: 0;
        font-size: 1.2rem;
    }
    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }
    .sidebar-content {
        padding: 1rem;
        overflow-y: auto;
        flex-grow: 1;
    }
    ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    li {
        margin-bottom: 0.5rem;
    }
    /* Target the global helper class within this component */
    .sidebar-content :global(.link-button) {
        font-size: 0.95rem;
        display: flex;
        justify-content: space-between;
        width: 100%;
        align-items: baseline;
    }
    .reference-count {
        font-size: 0.8em;
        color: var(--color-text-secondary);
        font-style: italic;
        padding-left: 0.5rem;
        flex-shrink: 0;
    }
</style>
