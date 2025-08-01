<script lang="ts">
    import Editor from "$lib/components/Editor.svelte";
    import Preview from "$lib/components/Preview.svelte";
    import Button from "$lib/components/Button.svelte";
    import ErrorBox from "$lib/components/ErrorBox.svelte";
    import SaveStatus from "$lib/components/SaveStatus.svelte";
    import {
        fileViewMode,
        currentView,
        rightSidebar,
        navigation,
    } from "$lib/viewStores";
    import { files, isWorldLoaded } from "$lib/worldStore";
    import {
        buildPageView,
        writePageContent,
        renderPagePreview,
    } from "$lib/commands";
    import { handleLinkClick } from "$lib/actions";
    import type { PageHeader, FullPageData } from "$lib/bindings";
    import { findFileInTree } from "$lib/utils";
    import { AUTOSAVE_DEBOUNCE_MS } from "$lib/config";

    let { file } = $props<{ file: PageHeader }>();

    let pageData = $state<FullPageData | null>(null);
    let error = $state<string | null>(null);
    let isLoading = $state(true);
    let pristineContent = $state("");
    let saveStatus: "idle" | "dirty" | "saving" | "error" = $state("idle");
    let lastSaveTime = $state<Date | null>(null);
    let saveTimeout: number;

    // This effect handles loading the page data whenever the `file` prop changes.
    $effect(() => {
        // --- State Reset ---
        isLoading = true;
        pageData = null;
        error = null;
        pristineContent = "";
        saveStatus = "idle"; // Reset save status for the new file
        lastSaveTime = null; // Reset last save time for the new file
        rightSidebar.update((state) => ({ ...state, backlinks: [] })); // Reset backlinks

        // --- Data Fetching ---
        buildPageView(file.path)
            .then((data) => {
                pageData = data;
                pristineContent = data.raw_content;
                // Update the backlinks in the store for the right sidebar.
                rightSidebar.update((state) => ({
                    ...state,
                    backlinks: data.backlinks,
                }));
            })
            .catch((e) => {
                console.error("Failed to get page data:", e);
                error = `Could not load file: ${e}`;
            })
            .finally(() => {
                isLoading = false;
            });

        // Cleanup function clears any pending save timeouts when the file changes or component unmounts.
        return () => {
            clearTimeout(saveTimeout);
        };
    });

    // This effect handles auto-saving the content and updating the visual status indicator.
    $effect(() => {
        if (!pageData) return;

        // If content is unchanged, reset status if it was dirty (e.g., from an undo action).
        if (pageData.raw_content === pristineContent) {
            if (saveStatus === "dirty") saveStatus = "idle";
            return;
        }

        // Content has changed, so mark it as 'dirty' and prepare to save.
        saveStatus = "dirty";
        clearTimeout(saveTimeout);
        const path = file.path;
        const contentToSave = pageData.raw_content;

        saveTimeout = window.setTimeout(() => {
            saveStatus = "saving";
            writePageContent(path, contentToSave)
                .then(() => {
                    pristineContent = contentToSave;
                    saveStatus = "idle"; // Return to idle after a successful save
                    lastSaveTime = new Date(); // Set the timestamp of the successful save

                    // Re-render the preview with the new content.
                    return renderPagePreview(contentToSave);
                })
                .then((newlyRenderedData) => {
                    if (pageData) pageData.rendered_page = newlyRenderedData;
                })
                .catch((e) => {
                    console.error("Failed to save or re-render content:", e);
                    saveStatus = "error";
                });
        }, AUTOSAVE_DEBOUNCE_MS);
    });

    // This effect navigates away if the current file is deleted from the vault.
    $effect(() => {
        const tree = $files;
        if ($isWorldLoaded && tree && !findFileInTree(tree, file.path)) {
            console.log(
                `Current file ${file.path} not found in tree after update. Closing view.`,
            );
            currentView.set({ type: "welcome" });
        }
    });

    const hasInfoboxContent = $derived(
        pageData?.rendered_page.processed_frontmatter &&
            Object.keys(pageData.rendered_page.processed_frontmatter).length >
                0,
    );
</script>

<div class="file-view-container">
    {#if isLoading}
        <div class="status-container">
            <p>Loading...</p>
        </div>
    {:else if error}
        <div class="status-container">
            <ErrorBox title="File Error">{error}</ErrorBox>
        </div>
    {:else if pageData}
        <div class="view-header">
            <div class="header-left">
                <div class="navigation-arrows">
                    <Button
                        variant="ghost"
                        size="small"
                        title="Back"
                        disabled={!$navigation.canGoBack}
                        onclick={navigation.back}
                    >
                        &larr;
                    </Button>
                    <Button
                        variant="ghost"
                        size="small"
                        title="Forward"
                        disabled={!$navigation.canGoForward}
                        onclick={navigation.forward}
                    >
                        &rarr;
                    </Button>
                </div>
                <div class="title-container">
                    <h2 class="view-title" title={file.title}>
                        {file.title}
                    </h2>
                    <SaveStatus status={saveStatus} {lastSaveTime} />
                </div>
            </div>

            <div class="view-actions">
                {#if $rightSidebar.backlinks.length > 0}
                    <Button
                        size="small"
                        onclick={() =>
                            rightSidebar.update((state) => ({
                                ...state,
                                isVisible: !state.isVisible,
                            }))}
                        title="Toggle Backlinks"
                    >
                        🔗 {$rightSidebar.backlinks.length}
                    </Button>
                {/if}

                {#if $fileViewMode === "split"}
                    <Button
                        size="small"
                        onclick={() => ($fileViewMode = "preview")}
                    >
                        📖 Preview Only
                    </Button>
                {:else}
                    <Button
                        size="small"
                        onclick={() => ($fileViewMode = "split")}
                    >
                        ✏️ Edit
                    </Button>
                {/if}
            </div>
        </div>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="content-panes"
            onclick={handleLinkClick}
            onkeydown={handleLinkClick}
        >
            {#if $fileViewMode === "split"}
                <div class="editor-pane">
                    <Editor bind:content={pageData.raw_content} />
                </div>
                <div class="preview-pane">
                    <Preview
                        renderedData={pageData.rendered_page}
                        infoboxData={hasInfoboxContent
                            ? pageData.rendered_page.processed_frontmatter
                            : null}
                        mode="split"
                    />
                </div>
            {:else}
                <div class="unified-preview-pane">
                    <Preview
                        renderedData={pageData.rendered_page}
                        infoboxData={hasInfoboxContent
                            ? pageData.rendered_page.processed_frontmatter
                            : null}
                        mode="unified"
                    />
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .file-view-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }
    .view-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 2rem;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border-bottom: 1px solid var(--border-color);
        z-index: 20;
        height: 60px;
        box-sizing: border-box;
        flex-shrink: 0;
    }
    .header-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 1;
        min-width: 0; /* Prevents the container from overflowing */
    }
    .navigation-arrows {
        display: flex;
        flex-shrink: 0; /* Prevents arrows from being squished */
    }
    .title-container {
        display: flex;
        align-items: baseline;
        gap: 1rem;
        flex-shrink: 1;
        overflow: hidden;
        min-width: 0; /* Helps with ellipsis truncation */
    }
    .view-title {
        font-family: var(--font-family-heading);
        color: var(--ink-heading);
        margin: 0;
        font-size: 1.5rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .view-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
    }
    .content-panes {
        display: flex;
        flex-grow: 1;
        height: 100%;
        box-sizing: border-box;
        overflow: hidden;
    }
    .unified-preview-pane {
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
        min-width: 0;
    }
    .preview-pane {
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
        height: 100%;
        box-sizing: border-box;
    }
    .editor-pane {
        flex: 1;
        overflow-y: auto;
        height: 100%;
        box-sizing: border-box;
        border-right: 1px solid var(--border-color);
    }
    .status-container {
        padding: 2rem;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
    }
</style>
