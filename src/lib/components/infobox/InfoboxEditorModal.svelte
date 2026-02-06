<script lang="ts">
    import { onMount, tick } from "svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
    import InfoboxContentTab from "$lib/components/infobox/InfoboxContentTab.svelte";
    import InfoboxImagesTab from "$lib/components/infobox/InfoboxImagesTab.svelte";
    import InfoboxLayoutTab from "$lib/components/infobox/InfoboxLayoutTab.svelte";
    import { files, vaultPath, allImageFiles } from "$lib/worldStore";
    import {
        parseInfoboxContent,
        mergeTemplateState,
        createField,
        createImage,
        createLayoutRule,
        applyInfoboxStateToContent,
        getAvailableTemplates,
        type EditorField,
        type ImageEntry,
        type EditorLayoutRule,
        type InfoboxState,
    } from "$lib/infobox";
    import { buildPageView } from "$lib/commands";

    let { onClose, initialContent, onSave } = $props<{
        onClose: () => void;
        initialContent: string;
        onSave: (newContent: string) => void;
    }>();

    // --- State ---
    let isLoading = $state(true);
    type TabId = "content" | "images" | "layout" | "templates";
    let activeTab = $state<TabId>("content");
    let isSaving = $state(false);

    // Scroll handling
    let scrollContainer = $state<HTMLElement>();

    // Core Data
    let title = $state("");
    let subtitle = $state("");
    let tags = $state<string[]>([]);

    // Custom Fields
    let customFields = $state<EditorField[]>([]);
    let images = $state<ImageEntry[]>([]);
    let layoutRules = $state<EditorLayoutRule[]>([]);

    // Templates
    let availableTemplates = $derived(
        $files && $vaultPath ? getAvailableTemplates([$files], $vaultPath) : [],
    );
    let selectedTemplatePath = $state("");

    // --- Validation ---
    // Real-time duplicate detection: Returns a Set of keys that are duplicates
    let duplicateKeys = $derived.by(() => {
        const counts = new Map<string, number>();

        for (const field of customFields) {
            const key = field.key.trim();
            // Skip empty keys or default "New Field" if you want to be lenient,
            // but usually we want to catch duplicates of "New Field" too if they try to save.
            if (!key) continue;

            counts.set(key, (counts.get(key) || 0) + 1);
        }

        const duplicates = Array.from(counts.entries())
            .filter(([_, count]) => count > 1)
            .map(([key]) => key);

        return new Set(duplicates);
    });

    // --- Initialization ---

    onMount(() => {
        try {
            const state = parseInfoboxContent(initialContent);
            initializeForm(state);
        } catch (e) {
            console.error("Failed to parse infobox data", e);
            initializeForm(parseInfoboxContent(""));
        } finally {
            isLoading = false;
        }
    });

    function initializeForm(state: InfoboxState) {
        title = state.title;
        subtitle = state.subtitle;
        tags = state.tags;
        images = state.images;
        customFields = state.customFields;
        layoutRules = state.layoutRules;
    }

    // --- Actions ---

    // Helper: Scroll to bottom and focus the last added item
    async function scrollToBottomAndFocus() {
        await tick(); // Wait for DOM update

        if (scrollContainer) {
            // 1. Scroll to bottom
            scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: "smooth",
            });

            // 2. Find and Focus
            setTimeout(() => {
                if (!scrollContainer) return;

                // Look for the last item card (works for fields, images, and rules)
                const cards = scrollContainer.querySelectorAll(
                    ".sortable-card, .image-card",
                );
                const lastCard = cards[cards.length - 1];

                if (lastCard) {
                    // Find the first input or textarea within that card
                    const input = lastCard.querySelector(
                        "input, textarea",
                    ) as HTMLElement;
                    if (input) {
                        // Focus with preventScroll since we handle scrolling manually
                        input.focus({ preventScroll: true });
                    }
                }

                // Re-apply scroll in case focus shifted the view
                scrollContainer.scrollTo({
                    top: scrollContainer.scrollHeight,
                    behavior: "smooth",
                });
            }, 150);
        }
    }

    // Wrappers to handle scrolling after adding items
    function addField() {
        customFields = [...customFields, createField()];
        scrollToBottomAndFocus();
    }

    function addImage() {
        images = [...images, createImage()];
        scrollToBottomAndFocus();
    }

    function addLayoutRule(type: "header" | "separator" | "columns" | "alias") {
        layoutRules = [...layoutRules, createLayoutRule(type)];
        scrollToBottomAndFocus();
    }

    // --- Actions: Template ---
    async function applyTemplate() {
        if (!selectedTemplatePath) return;
        if (
            !confirm(
                "Merge template fields? Existing values may be overwritten.",
            )
        )
            return;

        try {
            // Fetch the raw content string of the template
            const data = await buildPageView(selectedTemplatePath);

            // Construct current state object to merge against
            const currentState = {
                title,
                subtitle,
                tags,
                images,
                customFields,
                layoutRules,
            };

            // Use the pure logic helper in infobox.ts to merge
            const merged = mergeTemplateState(currentState, data.raw_content);
            initializeForm(merged);
            activeTab = "content"; // Switch back to see changes
        } catch (e) {
            console.error(e);
            alert("Failed to load template.");
        }
    }

    // --- Save Logic ---

    function handleSave(shouldClose: boolean) {
        if (duplicateKeys.size > 0) {
            alert("Please resolve duplicate keys before saving.");
            return;
        }

        isSaving = true;

        try {
            const currentState: InfoboxState = {
                title,
                subtitle,
                tags,
                images,
                customFields,
                layoutRules,
            };

            // 1. Generate new content string IN MEMORY
            const newContent = applyInfoboxStateToContent(
                initialContent,
                currentState,
            );

            // 2. Pass it back to the parent
            onSave(newContent);

            if (shouldClose) onClose();
        } catch (e) {
            console.error(e);
            alert(`Failed to save: ${e}`);
        } finally {
            isSaving = false;
        }
    }
</script>

<Modal title="Infobox Editor" {onClose}>
    {#if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading...</p>
        </div>
    {:else}
        <div class="editor-container">
            <!-- Tabs -->
            <div class="tabs-header">
                {#each [{ id: "content", icon: "file", label: "Content" }, { id: "images", icon: "image", label: "Images" }, { id: "layout", icon: "split", label: "Layout" }, { id: "templates", icon: "settings", label: "Templates" }] as tab}
                    <button
                        class:active={activeTab === tab.id}
                        onclick={() => (activeTab = tab.id as TabId)}
                    >
                        <Icon type={tab.icon as any} />
                        {tab.label}
                    </button>
                {/each}
            </div>

            <!-- Tab Content -->
            <div
                class="tab-content custom-scrollbar"
                bind:this={scrollContainer}
            >
                {#if activeTab === "content"}
                    <InfoboxContentTab
                        bind:title
                        bind:subtitle
                        bind:tags
                        bind:customFields
                        {duplicateKeys}
                        onAddField={addField}
                    />
                {:else if activeTab === "images"}
                    <InfoboxImagesTab
                        bind:images
                        allImageFiles={$allImageFiles}
                        onAddImage={addImage}
                    />
                {:else if activeTab === "layout"}
                    <InfoboxLayoutTab
                        bind:layoutRules
                        {customFields}
                        onAddRule={addLayoutRule}
                    />
                {:else if activeTab === "templates"}
                    <div class="form-section">
                        <div class="template-selector-box">
                            <h4>Inherit Template</h4>
                            <p class="helper-text">
                                Merge fields from an existing template.
                            </p>
                            <div class="split-row">
                                <label
                                    for="template-select"
                                    class="visually-hidden"
                                    >Select Template</label
                                >
                                <div style="flex-grow: 1;">
                                    <SearchableSelect
                                        options={availableTemplates.map(
                                            (t) => t.path,
                                        )}
                                        bind:value={selectedTemplatePath}
                                        placeholder="Select a template..."
                                        formatLabel={(path) =>
                                            availableTemplates.find(
                                                (t) => t.path === path,
                                            )?.label || path}
                                    />
                                </div>
                                <Button
                                    onclick={applyTemplate}
                                    disabled={!selectedTemplatePath}
                                    >Apply</Button
                                >
                            </div>
                        </div>
                    </div>
                {/if}
            </div>

            <div class="editor-footer">
                <Button onclick={onClose}>Cancel</Button>
                <div class="save-group">
                    <Button
                        variant="primary"
                        onclick={() => handleSave(false)}
                        disabled={isSaving || duplicateKeys.size > 0}
                        >Apply</Button
                    >
                    <Button
                        variant="primary"
                        onclick={() => handleSave(true)}
                        disabled={isSaving || duplicateKeys.size > 0}
                        >Save & Close</Button
                    >
                </div>
            </div>
        </div>
    {/if}
</Modal>

<style>
    .loading-state {
        height: 300px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
    }
    .spinner {
        width: 30px;
        height: 30px;
        border: 3px solid var(--color-border-primary);
        border-top-color: var(--color-accent-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .editor-container {
        display: flex;
        flex-direction: column;
        height: 60vh; /* Reduced to avoid outer scrollbar conflict */
        width: 600px;
        max-width: 100%; /* Prevent horizontal scroll on smaller screens */
        overflow: hidden; /* Critical: Prevent double vertical scrollbar on outer container */
    }

    /* --- Tabs --- */
    .tabs-header {
        display: flex;
        gap: 0.5rem;
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: 0.5rem;
        margin-bottom: 1rem;
    }
    .tabs-header button {
        background: none;
        border: none;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        color: var(--color-text-secondary);
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        border-radius: 6px;
        transition: all 0.2s;
    }
    .tabs-header button:hover {
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
    }
    .tabs-header button.active {
        background-color: var(--color-background-tertiary);
        color: var(--color-accent-primary);
    }

    /* --- Content Area --- */
    .tab-content {
        flex-grow: 1;
        overflow-y: auto;
        overflow-x: hidden; /* Fix horizontal scrollbar */
        padding-right: 0.5rem;
        padding-bottom: 1rem;
        padding-left: 2px; /* Slight padding for focus rings */
    }

    .form-section {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        min-width: 0;
    }

    /* --- Template --- */
    .template-selector-box {
        background: var(--color-background-tertiary);
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid var(--color-border-primary);
        text-align: center;
    }
    .split-row {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
    }

    /* --- Footer --- */
    .editor-footer {
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border-primary);
        display: flex;
        justify-content: space-between;
    }
    .save-group {
        display: flex;
        gap: 0.5rem;
    }
    .helper-text {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin: 0;
    }
    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
</style>
