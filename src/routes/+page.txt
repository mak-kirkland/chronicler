<script lang="ts">
    import { currentView, fileViewMode, rightSidebar } from "$lib/stores";
    import TagIndexView from "$lib/components/TagIndexView.svelte";
    import FileView from "$lib/components/FileView.svelte";
    import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";

    // This effect resets the file view mode and hides the right sidebar
    // whenever the user navigates away from the file view.
    $effect(() => {
        if ($currentView.type !== "file") {
            $fileViewMode = "preview";
            rightSidebar.update((state) => ({ ...state, isVisible: false }));
        }
    });
</script>

{#if $currentView.type === "welcome"}
    <div class="welcome-screen">
        <img src="/compass.svg" alt="Compass" class="welcome-icon" />
        <h1 class="welcome-title">Chronicler</h1>
        <p class="welcome-text">
            Select a page from the sidebar to begin your journey.
        </p>
    </div>
{:else if $currentView.type === "tag"}
    <TagIndexView name={$currentView.tagName} />
{:else if $currentView.type === "file" && $currentView.data}
    <FileView file={$currentView.data} />
{/if}

{#if $rightSidebar.isVisible}
    <BacklinksPanel />
{/if}

<style>
    .welcome-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        width: 100%;
    }
    .welcome-icon {
        width: 150px;
        height: 150px;
        opacity: 0.6;
        margin-bottom: 2rem;
    }
    .welcome-title {
        font-family: "Uncial Antiqua", cursive;
        font-size: 4rem;
        margin-bottom: 1rem;
        color: #6a5f55;
    }
    .welcome-text {
        font-size: 1.2rem;
    }
</style>
