<script lang="ts">
    import Editor from "$lib/components/views/Editor.svelte";
    import Preview from "$lib/components/views/Preview.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import SaveStatus from "$lib/components/views/SaveStatus.svelte";
    import ViewHeader from "$lib/components/views/ViewHeader.svelte";
    import { tabs, tabStatus, isViewSplit } from "$lib/viewStores";
    import type { FileViewMode } from "$lib/viewStores";
    import { onDestroy } from "svelte";
    import { undo, redo } from "@codemirror/commands";
    import type { EditorView } from "@codemirror/view";
    import ContextRail from "$lib/components/views/ContextRail.svelte";
    import type { RailSection } from "$lib/components/views/ContextRail.svelte";
    import { isTocVisible } from "$lib/settingsStore";
    import { files, isWorldLoaded, vaultPath } from "$lib/worldStore";
    import {
        buildPageView,
        writePageContent,
        renderPagePreview,
    } from "$lib/commands";
    import {
        handleContentClick,
        navigateToMap,
        navigateToPage,
        navigateToTag,
    } from "$lib/actions";
    import type {
        PageHeader,
        FullPageData,
        Backlink,
        MapLink,
    } from "$lib/bindings";
    import { findFileInTree, parentFolderName } from "$lib/utils";
    import { AUTOSAVE_DEBOUNCE_MS } from "$lib/config";
    import { log } from "$lib/logger";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { openModal, closeModal } from "$lib/modalStore";
    import InfoboxEditorModal from "$lib/components/infobox/InfoboxEditorModal.svelte";
    import MenuList from "$lib/components/ui/MenuList.svelte";
    import { t } from "$lib/i18n";

    let { file, sectionId, tabId, isActive, initialMode } = $props<{
        file: PageHeader;
        sectionId?: string;
        tabId: string;
        isActive: boolean;
        initialMode?: FileViewMode;
    }>();

    // svelte-ignore state_referenced_locally
    let mode = $state<FileViewMode>(initialMode ?? "preview");
    let backlinks = $state<Backlink[]>([]);

    // The context rail (contents + backlinks + tags) is one panel with one
    // switch. `isTocVisible` remains the persisted preference: it seeds the
    // rail for each new view, and toggling writes back so the next page you
    // open matches the choice you just made.
    // svelte-ignore state_referenced_locally
    let showContextRail = $state($isTocVisible);
    let railFocus = $state<{ section: RailSection } | null>(null);

    /**
     * Opens the rail at `section`, or closes it if that section is already
     * what you're looking at. Pressing the *other* section's button while the
     * rail is open scrolls there instead of closing — closing something you
     * were trying to navigate would be a trap.
     */
    function toggleRail(section: RailSection) {
        // `railFocus === null` means "open, but you haven't picked a section" —
        // the state a freshly opened page starts in. Both segments render as
        // active then, so a click on either has to close, or the button that
        // looks pressed doesn't unpress until you click it twice.
        if (
            showContextRail &&
            (railFocus === null || railFocus.section === section)
        ) {
            showContextRail = false;
            $isTocVisible = false;
            return;
        }
        showContextRail = true;
        $isTocVisible = true;
        railFocus = { section };
    }

    function closeRail() {
        showContextRail = false;
        $isTocVisible = false;
    }

    // The editor and preview both stay mounted across mode toggles (only their
    // visibility/width change via CSS) so scroll position and CodeMirror state
    // survive switching preview ↔ split ↔ editor. The editor is mounted lazily
    // on first edit and then kept, so files you only ever read never spin up a
    // CodeMirror instance.
    // svelte-ignore state_referenced_locally
    let editorEverShown = $state((initialMode ?? "preview") !== "preview");
    $effect(() => {
        if (mode !== "preview") editorEverShown = true;
    });

    // Editor-only mode hides the preview with `display: none`, and WebKitGTK
    // drops the scrollTop of a display:none container (Chrome keeps it). So we
    // track the preview's scroll while it's visible and re-apply it whenever it
    // becomes visible again, instead of trusting the browser to preserve it.
    let previewPaneEl = $state<HTMLElement | null>(null);
    let savedPreviewScroll = 0;

    // Tracks whether the pane is too narrow to fit the header button labels
    // (e.g. a small window), so they can collapse to icons. The template ORs
    // this with split view, which always shows icons. A ResizeObserver (rather
    // than a CSS container query) avoids turning the container into a containing
    // block, which would disturb the Maps dropdown's positioning.
    let fileContainerEl = $state<HTMLElement | null>(null);
    let narrowHeader = $state(false);
    let narrowPane = $state(false);
    const NARROW_HEADER_PX = 640;
    /** Below this the page's generous outer padding costs more than it buys. */
    const NARROW_PANE_PX = 900;
    $effect(() => {
        if (!fileContainerEl) return;
        const ro = new ResizeObserver((entries) => {
            const width = entries[0].contentRect.width;
            // A background tab is display:none and measures 0, which would
            // collapse this header to icons and expand it again the moment the
            // tab is shown — a visible flicker on every tab switch. Keep the
            // last real measurement; a new one arrives when the pane is back.
            if (width === 0) return;
            narrowHeader = width < NARROW_HEADER_PX;
            narrowPane = width < NARROW_PANE_PX;
        });
        ro.observe(fileContainerEl);
        return () => ro.disconnect();
    });
    function rememberPreviewScroll() {
        if (mode !== "editor" && previewPaneEl) {
            savedPreviewScroll = previewPaneEl.scrollTop;
        }
    }
    $effect(() => {
        if (mode !== "editor" && previewPaneEl) {
            const el = previewPaneEl;
            const top = savedPreviewScroll;
            // rAF lets the re-shown / re-laid-out content settle before we
            // restore, so the scrollTop isn't clamped against a stale height.
            requestAnimationFrame(() => (el.scrollTop = top));
        }
    });

    let pageData = $state<FullPageData | null>(null);
    let error = $state<string | null>(null);
    let isLoading = $state(true);
    let showLoading = $state(false); // Controls the visual "Loading..." message
    let pristineContent = $state("");
    let saveStatus: "idle" | "dirty" | "saving" | "error" = $state("idle");
    let lastSaveTime = $state<Date | null>(null);
    let saveTimeout: number;
    let loadingTimer: number; // Timer to delay showing the loading message

    // State for Map Dropdown
    let isMapMenuOpen = $state(false);
    let mapButtonEl = $state<HTMLElement | null>(null);

    // Check if this page is pinned on any maps
    let associatedMaps = $derived(pageData?.associated_maps || []);

    // --- Page bar + context rail ---
    // The folder the page lives in, shown before the title. Empty at the vault
    // root, where repeating the vault name would say nothing.
    let breadcrumbFolder = $derived(parentFolderName(file.path, $vaultPath));

    let toc = $derived(pageData?.rendered_page?.toc ?? []);

    // Frontmatter tags, defended against a hand-edited `tags:` that isn't a list.
    let pageTags = $derived.by<string[]>(() => {
        const raw = pageData?.rendered_page?.processed_frontmatter?.tags;
        return Array.isArray(raw)
            ? raw.filter((t) => typeof t === "string")
            : [];
    });

    // With nothing to put in it, the rail is just a 252px stripe of empty.
    //
    // Tags deliberately don't count on their own. The only control that
    // reopens the rail is the Contents|Backlinks pair, so a page with tags but
    // no headings and no backlinks could be closed and never reopened. Tags
    // are not lost — they still render in the infobox and the preview footer.
    let hasRailContent = $derived(toc.length > 0 || backlinks.length > 0);

    // The path currently loaded into `pageData`. Makes the load effect below
    // idempotent — it only resets/refetches when the path actually changes.
    let loadedPath: string | null = null;

    // Persist any unsaved edits for `path` before we navigate away from it.
    // Skips when a save is already in flight ("saving") — that write persists
    // the same content; "dirty"/"error" still need flushing.
    function flushPendingEdits(path: string | null) {
        if (
            path &&
            pageData &&
            pageData.raw_content !== pristineContent &&
            saveStatus !== "saving"
        ) {
            void writePageContent(path, pageData.raw_content);
        }
    }

    // Load page data when the file path changes. The path guard is load-bearing:
    // Svelte re-runs this effect on UNRELATED store changes too, because the
    // parent passes fresh spread props (e.g. when focus moves to the other split
    // pane). Without the guard each spurious run would null out pageData,
    // tearing down the content DOM and resetting the scroll position.
    $effect(() => {
        const path = file.path;
        if (path === loadedPath) return;

        // Flush the outgoing file's edits before swapping in the new one.
        flushPendingEdits(loadedPath);
        loadedPath = path;

        // --- State Reset ---
        isLoading = true;
        showLoading = false; // Reset the visual loading state
        pageData = null;
        error = null;
        pristineContent = "";
        saveStatus = "idle"; // Reset save status for the new file
        lastSaveTime = null; // Reset last save time for the new file
        savedPreviewScroll = 0; // A new file starts at the top, not the old scroll
        clearTimeout(saveTimeout); // Drop the previous file's pending autosave
        clearTimeout(loadingTimer); // Clear any pending loading message timer
        backlinks = []; // Reset backlinks
        railFocus = null; // The new page's rail starts unscrolled
        isMapMenuOpen = false; // Close menu on navigation

        // --- Set a timer to show the "Loading..." message only if it takes too long ---
        loadingTimer = window.setTimeout(() => {
            showLoading = true;
        }, 500); // Only show "Loading..." after 500ms

        // --- Data Fetching --- (`loadedPath !== path` guards a stale fetch that
        // resolves after we've already navigated somewhere else.)
        buildPageView(path)
            .then((data) => {
                if (loadedPath !== path) return;
                pageData = data;
                pristineContent = data.raw_content;
                // Update the backlinks shown in the right sidebar.
                backlinks = data.backlinks;
            })
            .catch((e) => {
                if (loadedPath !== path) return;
                log.error("Failed to get page data", e, "FileView");
                error = $t("fileView.loadFailed", { error: String(e) });
            })
            .finally(() => {
                if (loadedPath !== path) return;
                isLoading = false;
                showLoading = false; // Hide loading message
                clearTimeout(loadingTimer); // Clear timer as loading is finished
            });
    });

    // Flush pending edits and clear timers when the tab unmounts (tab close,
    // vault switch). Navigating within the tab is flushed in the load effect.
    onDestroy(() => {
        clearTimeout(saveTimeout);
        clearTimeout(loadingTimer);
        flushPendingEdits(loadedPath);
    });

    /**
     * Writes `contentToSave` to `path` and re-renders the preview from it.
     * Shared by the autosave timer and the explicit Save action, so both land
     * in exactly the same state.
     */
    function performSave(path: string, contentToSave: string) {
        clearTimeout(saveTimeout);
        saveStatus = "saving";
        writePageContent(path, contentToSave)
            .then(() => {
                // If the user navigated to another file while this save was
                // in flight, the component's reactive state now belongs to
                // that file — don't write this file's status/preview onto
                // it. The content itself was already persisted above.
                if (file.path !== path) return null;
                pristineContent = contentToSave;
                saveStatus = "idle"; // Return to idle after a successful save
                lastSaveTime = new Date(); // Set the timestamp of the successful save

                // Re-render the preview with the new content.
                return renderPagePreview(contentToSave);
            })
            .then((newlyRenderedData) => {
                if (newlyRenderedData && pageData) {
                    pageData.rendered_page = newlyRenderedData;
                }
            })
            .catch((e) => {
                if (file.path !== path) return;
                log.error("Failed to save or re-render content", e, "FileView");
                saveStatus = "error";
            });
    }

    /**
     * Saves now instead of when the autosave debounce elapses. Backs the Save
     * button and Ctrl/Cmd+S. A no-op when there is nothing outstanding, so
     * pressing it on a clean page does not rewrite the file's mtime.
     */
    function saveNow() {
        if (!pageData || pageData.raw_content === pristineContent) return;
        performSave(file.path, pageData.raw_content);
    }

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

        saveTimeout = window.setTimeout(
            () => performSave(path, contentToSave),
            AUTOSAVE_DEBOUNCE_MS,
        );
    });

    // --- Undo / redo / save ---
    // The page bar drives CodeMirror's own history rather than keeping a second
    // one: the editor is the only thing that edits the document.
    let editorView = $state<EditorView | undefined>(undefined);

    function runHistory(command: (view: EditorView) => boolean) {
        if (!editorView) return;
        command(editorView);
        editorView.focus();
    }

    // Surface this tab's save status to the tab bar.
    $effect(() => {
        tabStatus.set(tabId, saveStatus);
    });
    onDestroy(() => tabStatus.clear(tabId));

    // This effect navigates away if the current file is deleted from the vault.
    $effect(() => {
        const tree = $files;
        if ($isWorldLoaded && tree && !findFileInTree(tree, file.path)) {
            log.debug(
                `Current file ${file.path} not found in tree; closing tab.`,
                "FileView",
            );
            tabs.close(tabId);
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

    /**
     * Handles the "Edit Infobox" action from the Preview component.
     * We define it here because this is where the source of truth (`pageData.raw_content`) lives.
     * This prevents stale data issues when editing from Preview mode.
     */
    function handleInfoboxEdit() {
        if (!pageData) return;

        openModal({
            component: InfoboxEditorModal,
            props: {
                onClose: closeModal,
                initialContent: pageData.raw_content,
                onSave: (newContent: string) => {
                    if (pageData) {
                        pageData.raw_content = newContent;
                        // This assignment triggers the Autosave Effect above automatically.
                    }
                },
            },
        });
    }

    // --- Map Navigation Handler ---
    // One map is a link; several are a menu. The menu anchors to the wrapper
    // div's bind:this, so the click event itself isn't needed.
    function handleMapClick() {
        if (associatedMaps.length === 1) {
            navigateToMap({
                title: associatedMaps[0].title,
                path: associatedMaps[0].path,
            });
        } else if (associatedMaps.length > 1) {
            isMapMenuOpen = !isMapMenuOpen;
        }
    }
</script>

<div class="file-view-container" bind:this={fileContainerEl}>
    {#if isLoading && showLoading}
        <div class="status-container">
            <p>{$t("common.loading")}</p>
        </div>
    {:else if error}
        <div class="status-container">
            <ErrorBox title={$t("fileView.errorTitle")}>{error}</ErrorBox>
        </div>
    {:else if pageData}
        <ViewHeader>
            <!-- Breadcrumb rather than a heading: the tab already names the
                 page, so the bar's job is to say where it sits. -->
            <div slot="left" class="title-container">
                <nav class="breadcrumb" title={file.path}>
                    {#if breadcrumbFolder}
                        <span class="crumb-folder">{breadcrumbFolder}</span>
                        <span class="crumb-sep" aria-hidden="true">/</span>
                    {/if}
                    <span class="crumb-title">{file.title}</span>
                </nav>
                <SaveStatus status={saveStatus} {lastSaveTime} />
            </div>
            <!-- Collapse the action buttons to icons only (tooltips still name
                 them) when the pane is narrow, and always in split view, to
                 leave room for the title and save status. -->
            <div
                slot="right"
                class="header-actions"
                class:icons-only={narrowHeader || $isViewSplit}
            >
                <!-- Map Navigation Button -->
                {#if associatedMaps.length > 0}
                    <!-- Wrapper div to serve as reliable anchor -->
                    <div bind:this={mapButtonEl} style="position: relative;">
                        <Button
                            size="small"
                            onclick={handleMapClick}
                            aria-haspopup={associatedMaps.length > 1
                                ? "menu"
                                : undefined}
                            aria-expanded={associatedMaps.length > 1
                                ? isMapMenuOpen
                                : undefined}
                            title={associatedMaps.length === 1
                                ? $t("fileView.viewOnMapTitle", {
                                      name: associatedMaps[0].title,
                                  })
                                : $t("fileView.viewOnMaps")}
                        >
                            <Icon type="map" />
                            <span class="btn-label">
                                {associatedMaps.length === 1
                                    ? $t("fileView.viewOnMap")
                                    : $t("fileView.mapsCount", {
                                          count: associatedMaps.length,
                                      })}
                            </span>
                        </Button>

                        <MenuList
                            isOpen={isMapMenuOpen}
                            anchorEl={mapButtonEl}
                            width={200}
                            items={associatedMaps.map((m: MapLink) => ({
                                label: m.title,
                                title: m.path,
                                icon: "map" as const,
                                handler: () => navigateToMap(m),
                            }))}
                            onClose={() => (isMapMenuOpen = false)}
                        />
                    </div>
                {/if}

                <!-- Contents and Backlinks are two ways into one panel, so
                     they share one control. Pressed state = rail visible. -->
                {#if hasRailContent}
                    <div class="segmented">
                        {#if toc.length > 0}
                            <button
                                class:active={showContextRail}
                                aria-pressed={showContextRail}
                                onclick={() => toggleRail("contents")}
                                title={$t("fileView.toggleToc")}
                            >
                                <Icon type="contents" /><span class="btn-label"
                                    >{$t("fileView.contents")}</span
                                >
                            </button>
                        {/if}
                        {#if backlinks.length > 0}
                            <button
                                class:active={showContextRail}
                                aria-pressed={showContextRail}
                                onclick={() => toggleRail("backlinks")}
                                title={$t("fileView.toggleBacklinks")}
                            >
                                <Icon type="backlinks" /><span class="btn-label"
                                    >{$t("backlinks.title")}</span
                                >
                                {backlinks.length}
                            </button>
                        {/if}
                    </div>
                {/if}

                <!-- Undo/redo act on the editor, so they only exist once there
                     is one. In read mode they would be two permanently
                     disabled buttons. -->
                {#if mode !== "preview"}
                    <div class="history-actions">
                        <button
                            onclick={() => runHistory(undo)}
                            title={$t("editor.undo")}
                            aria-label={$t("editor.undo")}
                        >
                            <Icon type="undo" />
                        </button>
                        <button
                            onclick={() => runHistory(redo)}
                            title={$t("editor.redo")}
                            aria-label={$t("editor.redo")}
                        >
                            <Icon type="redo" />
                        </button>
                    </div>
                {/if}

                <!-- View mode. Reading is the quiet default, so it offers a
                     single call to action; once you're editing, all three
                     modes stay visible as one control. -->
                {#if mode === "preview"}
                    <Button
                        variant="accent"
                        size="small"
                        onclick={() => (mode = "split")}
                        title={$t("common.edit")}
                    >
                        <Icon type="edit" /><span class="btn-label persistent">
                            {$t("common.edit")}</span
                        >
                    </Button>
                {:else}
                    <div class="segmented mode-switch">
                        <!-- This branch only renders when mode isn't
                             "preview", so Read is never the pressed one here. -->
                        <button
                            aria-pressed="false"
                            onclick={() => (mode = "preview")}
                            title={$t("fileView.previewOnly")}
                            aria-label={$t("fileView.read")}
                        >
                            <Icon type="preview" />
                        </button>
                        <button
                            class:active={mode === "split"}
                            aria-pressed={mode === "split"}
                            onclick={() => (mode = "split")}
                            title={$t("fileView.splitView")}
                            aria-label={$t("fileView.split")}
                        >
                            <Icon type="split" />
                        </button>
                        <button
                            class:active={mode === "editor"}
                            aria-pressed={mode === "editor"}
                            onclick={() => (mode = "editor")}
                            title={$t("fileView.editorOnly")}
                            aria-label={$t("fileView.write")}
                        >
                            <Icon type="edit" />
                        </button>
                    </div>

                    <!-- The accent slot belongs to whatever the region is for.
                         Reading it is Edit; editing it is Save. -->
                    <Button
                        variant="accent"
                        size="small"
                        onclick={saveNow}
                        disabled={saveStatus === "idle"}
                        title={$t("common.save")}
                    >
                        <span class="btn-label persistent"
                            >{$t("common.save")}</span
                        >
                    </Button>
                {/if}
            </div>
        </ViewHeader>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!--
            The editor and preview are mounted once and shown/hidden/sized by the
            mode class, rather than swapped between {#if} branches. Recreating the
            scroll containers on every mode change would reset scroll position and
            tear down CodeMirror state; keeping them mounted preserves both.
        -->
        <div
            class="content-panes"
            class:split={mode === "split"}
            class:editor-only={mode === "editor"}
            class:preview-only={mode === "preview"}
            onclick={handleContentClick}
            onkeydown={handleContentClick}
        >
            {#if editorEverShown}
                <div class="editor-pane">
                    <Editor
                        bind:content={pageData.raw_content}
                        bind:editorView
                        pageName={file.title}
                        pagePath={file.path}
                        {isActive}
                        shouldFocus={mode !== "preview"}
                        showPaneHeader={mode === "split"}
                    />
                </div>
            {/if}
            <!--
                The preview-pane serves as the scrolling container.
                Inside, 'chronicler-preview' provides the background texture and padding.
            -->
            <div class="preview-column">
                {#if mode === "split"}
                    <!-- The preview half's matching label. Its right side is
                         deliberately empty: the design calls for scroll-lock
                         state there, and this build has no scroll lock. -->
                    <div class="preview-pane-header">
                        <span class="eyebrow">{$t("editor.previewPane")}</span>
                    </div>
                {/if}
                <div
                    class="preview-pane scrollable"
                    bind:this={previewPaneEl}
                    onscroll={rememberPreviewScroll}
                >
                    <div class="chronicler-preview" class:narrow={narrowPane}>
                        <Preview
                            renderedData={pageData.rendered_page}
                            infoboxData={pageData.rendered_page
                                .processed_frontmatter}
                            mode={mode === "split" ? "split" : "unified"}
                            onInfoboxEdit={handleInfoboxEdit}
                            fallbackTitle={file.title}
                        />
                    </div>
                </div>
            </div>
            {#if showContextRail && hasRailContent}
                <!-- Clicking a backlink navigates this tab to that page; the
                     Backlink is converted to a PageHeader for navigation. -->
                <ContextRail
                    {toc}
                    {backlinks}
                    tags={pageTags}
                    focus={railFocus}
                    onClose={closeRail}
                    onNavigate={(link) =>
                        navigateToPage({ title: link.title, path: link.path })}
                    onNavigateTag={navigateToTag}
                />
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
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 1;
        overflow: hidden;
        min-width: 0; /* Helps with ellipsis truncation */
    }
    .breadcrumb {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
    }
    .crumb-folder {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        /* The title outranks the folder: give up folder characters first. */
        flex-shrink: 4;
        min-width: 0;
    }
    .crumb-sep {
        color: var(--color-text-secondary);
        opacity: 0.5;
        flex-shrink: 0;
    }
    .crumb-title {
        font-family: var(--font-family-heading);
        color: var(--color-text-heading);
        font-size: 0.95rem;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 1;
        min-width: 0;
    }
    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }
    /* Narrow pane: collapse the action buttons to icons only. The label spans
       carry their own leading space, so hiding them removes the gap too.
       Edit/Save keep theirs: they are the only labelled control left in the
       bar, and dropping the label would leave it all-icon and ambiguous. */
    .header-actions.icons-only .btn-label:not(.persistent) {
        display: none;
    }

    /* The mode switch is icon-only at every width — three glyphs that are
       always the same three glyphs. */
    .mode-switch > button {
        padding: 0.34rem 0.5rem;
    }

    .history-actions {
        display: flex;
        gap: 2px;
    }
    .history-actions button {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5px;
        border: 1px solid transparent;
        border-radius: 4px;
        background: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        opacity: 0.75;
        transition:
            opacity 0.15s,
            background-color 0.15s;
    }
    .history-actions button:hover {
        opacity: 1;
        background: var(--color-background-secondary);
    }
    .content-panes {
        display: flex;
        flex-grow: 1;
        height: 100%;
        box-sizing: border-box;
        overflow: hidden;
    }

    /* Layout Panes. Both stay mounted; the mode classes below decide which is
       shown and how wide, so scroll/editor state persists across mode toggles. */
    /* The column owns the width; the pane inside it owns the scrolling, so the
       pane header can sit above the scroll container rather than inside it and
       scroll away with the article. */
    .preview-column {
        flex: 1;
        /* "width: 0" combined with "flex: 1" is a robust fix for preventing
           flex items from blowing out when containing wide children like tables/code blocks */
        width: 0;
        min-width: 0; /* Allows the pane to shrink */
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    .preview-pane-header {
        display: flex;
        align-items: center;
        height: 30px;
        flex-shrink: 0;
        box-sizing: border-box;
        padding: 0 14px;
        border-bottom: 1px solid var(--hairline-soft);
    }
    .preview-pane {
        flex: 1;
        min-height: 0;
        min-width: 0;
        position: relative; /* Context for the absolute wrapper */
    }
    .editor-pane {
        flex: 1;
        min-width: 0;
        height: 100%;
        box-sizing: border-box;
        overflow-y: auto; /* Editor can keep its simple scroll */
    }

    /* Preview-only: hide the editor, preview fills the width.
       Editor-only: hide the preview, editor fills the width.
       Split: both visible, with a divider down the middle. */
    .content-panes.preview-only .editor-pane {
        display: none;
    }
    .content-panes.editor-only .preview-column {
        display: none;
    }
    .content-panes.split .editor-pane {
        border-right: 1px solid var(--color-border-primary);
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
    .chronicler-preview.narrow {
        padding: 1.5rem 1.25rem;
    }
    .status-container {
        padding: 2rem;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
    }
</style>
