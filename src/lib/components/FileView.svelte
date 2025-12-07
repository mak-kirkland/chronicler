<script lang="ts">
    import Editor from "$lib/components/Editor.svelte";
    import Preview from "$lib/components/Preview.svelte";
    import Button from "$lib/components/Button.svelte";
    import ErrorBox from "$lib/components/ErrorBox.svelte";
    import SaveStatus from "$lib/components/SaveStatus.svelte";
    import ViewHeader from "$lib/components/ViewHeader.svelte";
    import { fileViewMode, currentView, rightSidebar } from "$lib/viewStores";
    import { isTocVisible } from "$lib/settingsStore";
    import { files, isWorldLoaded } from "$lib/worldStore";
    import {
        buildPageView,
        writePageContent,
        renderPagePreview,
    } from "$lib/commands";
    import { handleContentClick } from "$lib/actions";
    import type { PageHeader, FullPageData } from "$lib/bindings";
    import { findFileInTree } from "$lib/utils";
    import { AUTOSAVE_DEBOUNCE_MS } from "$lib/config";
    import Icon from "./Icon.svelte";

    let { file, sectionId } = $props<{
        file: PageHeader;
        sectionId?: string;
    }>();

    let pageData = $state<FullPageData | null>(null);
    let error = $state<string | null>(null);
    let isLoading = $state(true);
    let showLoading = $state(false); // Controls the visual "Loading..." message
    let pristineContent = $state("");
    let saveStatus: "idle" | "dirty" | "saving" | "error" = $state("idle");
    let lastSaveTime = $state<Date | null>(null);
    let saveTimeout: number;
    let loadingTimer: number; // Timer to delay showing the loading message

    // This effect handles loading the page data whenever the `file` prop changes.
    $effect(() => {
        // --- State Reset ---
        isLoading = true;
        showLoading = false; // Reset the visual loading state
        pageData = null;
        error = null;
        pristineContent = "";
        saveStatus = "idle"; // Reset save status for the new file
        lastSaveTime = null; // Reset last save time for the new file
        clearTimeout(loadingTimer); // Clear any pending loading message timer
        rightSidebar.update((state) => ({ ...state, backlinks: [] })); // Reset backlinks

        // --- Set a timer to show the "Loading..." message only if it takes too long ---
        loadingTimer = window.setTimeout(() => {
            showLoading = true;
        }, 500); // Only show "Loading..." after 500ms

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
                showLoading = false; // Hide loading message
                clearTimeout(loadingTimer); // Clear timer as loading is finished
            });

        // Cleanup function clears any pending save timeouts when the file changes or component unmounts.
        return () => {
            clearTimeout(saveTimeout);
            clearTimeout(loadingTimer); // Also clear the loading timer on cleanup
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
                `Current file ${file.path} not found in tree. Closing view.`,
            );
            currentView.set({ type: "welcome" });
        }
    });

    // This effect handles scrolling to a specific section when the page loads.
    $effect(() => {
        if (sectionId && pageData) {
            // A small delay ensures the DOM has been updated with the new page content.
            setTimeout(() => {
                const element = document.getElementById(sectionId);
                element?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        }
    });
</script>

<div class="file-view-container">
    {#if isLoading && showLoading}
        <div class="status-container">
            <p>Loading...</p>
        </div>
    {:else if error}
        <div class="status-container">
            <ErrorBox title="File Error">{error}</ErrorBox>
        </div>
    {:else if pageData}
        <ViewHeader>
            <div slot="left" class="title-container">
                <h2 class="view-title" title={file.title}>
                    {file.title}
                </h2>
                <SaveStatus status={saveStatus} {lastSaveTime} />
            </div>
            <div slot="right" class="header-actions">
                {#if pageData.rendered_page && pageData.rendered_page.toc.length > 0}
                    <Button
                        size="small"
                        onclick={() => ($isTocVisible = !$isTocVisible)}
                        title="Toggle Table of Contents"
                    >
                        <Icon type="contents" /> Contents
                    </Button>
                {/if}

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
                        <Icon type="backlinks" />
                        {$rightSidebar.backlinks.length}
                    </Button>
                {/if}

                <!-- View Mode Controls -->
                {#if $fileViewMode === "preview"}
                    <Button
                        size="small"
                        onclick={() => ($fileViewMode = "split")}
                        title="Edit"
                    >
                        <Icon type="edit" /> Edit
                    </Button>
                {/if}
                {#if $fileViewMode === "split"}
                    <Button
                        size="small"
                        onclick={() => ($fileViewMode = "editor")}
                        title="Editor Only"
                    >
                        <Icon type="file" /> Editor Only
                    </Button>
                    <Button
                        size="small"
                        onclick={() => ($fileViewMode = "preview")}
                        title="Preview Only"
                    >
                        <Icon type="preview" /> Preview Only
                    </Button>
                {/if}
                {#if $fileViewMode === "editor"}
                    <Button
                        size="small"
                        onclick={() => ($fileViewMode = "split")}
                        title="Split View"
                    >
                        <Icon type="split" /> Split View
                    </Button>
                    <Button
                        size="small"
                        onclick={() => ($fileViewMode = "preview")}
                        title="Preview Only"
                    >
                        <Icon type="preview" /> Preview Only
                    </Button>
                {/if}
            </div>
        </ViewHeader>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="content-panes"
            onclick={handleContentClick}
            onkeydown={handleContentClick}
        >
            {#if $fileViewMode === "split"}
                <div class="editor-pane">
                    <Editor bind:content={pageData.raw_content} />
                </div>
                <!--
                    The preview-pane serves as the scrolling container.
                    Inside, 'chronicler-preview' provides the background texture and padding.
                -->
                <div class="preview-pane scrollable">
                    <div class="chronicler-preview">
                        <Preview
                            renderedData={pageData.rendered_page}
                            infoboxData={pageData.rendered_page
                                .processed_frontmatter}
                            mode="split"
                        />
                    </div>
                </div>
            {:else if $fileViewMode === "editor"}
                <div class="unified-editor-pane">
                    <Editor bind:content={pageData.raw_content} />
                </div>
            {:else}
                <div class="unified-preview-pane scrollable">
                    <div class="chronicler-preview">
                        <Preview
                            renderedData={pageData.rendered_page}
                            infoboxData={pageData.rendered_page
                                .processed_frontmatter}
                            mode="unified"
                        />
                    </div>
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
    .title-container {
        display: flex;
        align-items: baseline;
        gap: 1rem;
        flex-shrink: 1;
        overflow: hidden;
        min-width: 0; /* Helps with ellipsis truncation */
    }
    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .view-title {
        font-family: var(--font-family-heading);
        color: var(--color-text-heading);
        margin: 0;
        font-size: 1.5rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .content-panes {
        display: flex;
        flex-grow: 1;
        height: 100%;
        box-sizing: border-box;
        overflow: hidden;
    }

    /* Layout Panes */
    .unified-preview-pane,
    .preview-pane {
        flex: 1;
        min-width: 0; /* Allows the pane to shrink */
        position: relative; /* Context for the absolute wrapper */
        height: 100%;
    }

    /* Utility to enable scrolling */
    .scrollable {
        overflow: auto;
    }

    /* The Preview Surface (Background Texture Layer).
       This div grows with content to ensure the texture covers the whole scrollable height.
    */
    .chronicler-preview {
        min-height: 100%;
        padding: 2rem;
        box-sizing: border-box;
        position: relative;
    }

    .unified-editor-pane {
        flex: 1;
        min-width: 0;
        height: 100%;
        overflow-y: auto;
    }

    .editor-pane {
        flex: 1;
        min-width: 0;
        height: 100%;
        box-sizing: border-box;
        border-right: 1px solid var(--color-border-primary);
        overflow-y: auto; /* Editor can keep its simple scroll */
    }
    .status-container {
        padding: 2rem;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
    }
</style>
