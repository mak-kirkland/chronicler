<script lang="ts">
    import { onMount } from "svelte";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import Icon from "./Icon.svelte";
    import SmartInput from "./SmartInput.svelte";
    import InfoboxFieldRow from "./InfoboxFieldRow.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import {
        files,
        vaultPath,
        allFileTitles,
        allImageFiles,
        tags as worldTags,
    } from "$lib/worldStore";
    import {
        parseInfoboxData,
        mergeTemplateState,
        createField,
        createImage,
        createLayoutRule,
        applyInfoboxStateToContent,
        resolveAllImagePreviews,
        getAvailableTemplates,
        type EditorField,
        type ImageEntry,
        type EditorLayoutRule,
        type InfoboxState,
    } from "$lib/infobox";
    import jsyaml from "js-yaml";
    import { buildPageView } from "$lib/commands";

    let { onClose, initialContent, onSave } = $props<{
        onClose: () => void;
        initialContent: string;
        onSave: (newContent: string) => void;
    }>();

    // --- State ---
    let isLoading = $state(true);
    let activeTab = $state<"content" | "images" | "structure" | "templates">(
        "content",
    );
    let isSaving = $state(false);

    // Core Data
    let title = $state("");
    let subtitle = $state("");
    let tags = $state<string[]>([]);

    // Custom Fields
    let customFields = $state<EditorField[]>([]);
    let images = $state<ImageEntry[]>([]);
    let layoutRules = $state<EditorLayoutRule[]>([]);

    // --- Image Preview Cache ---
    // Map of image ID -> resolved URL (for display)
    let imagePreviews = $state<Record<string, string>>({});

    // Templates
    let availableTemplates = $derived(
        $files && $vaultPath ? getAvailableTemplates([$files], $vaultPath) : [],
    );
    let selectedTemplatePath = $state("");

    // --- Initialization ---

    onMount(() => {
        try {
            // Parse the content passed in memory, NOT from disk.
            const match = initialContent.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                const parsed = jsyaml.load(match[1]) as any;
                initializeForm(parseInfoboxData(parsed));
            } else {
                // Initialize empty
                initializeForm(parseInfoboxData({}));
            }
        } catch (e) {
            console.error("Failed to parse infobox data", e);
            initializeForm(parseInfoboxData({}));
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

    // Resolve previews when images change
    $effect(() => {
        if (!$vaultPath || images.length === 0) return;
        resolveAllImagePreviews(images, $vaultPath).then((previews) => {
            imagePreviews = previews;
        });
    });

    // --- Actions ---

    function addTag(tagToAdd: string) {
        const cleaned = tagToAdd.trim();
        if (cleaned && !tags.includes(cleaned)) {
            tags.push(cleaned);
        }
    }

    function removeTag(tag: string) {
        tags = tags.filter((t) => t !== tag);
    }

    // --- Actions: Fields & Images ---
    function addField() {
        customFields.push(createField());
    }
    function removeField(index: number) {
        customFields.splice(index, 1);
    }

    // Generic Move Handler (Replaces specific move functions)
    function handleMove<T>(list: T[], index: number, direction: number) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= list.length) return;

        // Swap elements in place (Svelte 5 proxy friendly)
        const temp = list[index];
        list[index] = list[targetIndex];
        list[targetIndex] = temp;
    }

    function addImage() {
        images.push(createImage());
    }
    function removeImage(index: number) {
        images.splice(index, 1);
    }

    // --- Actions: Layout ---
    function addLayoutRule(type: "header" | "separator" | "columns") {
        layoutRules.push(createLayoutRule(type));
    }
    function removeLayoutRule(index: number) {
        layoutRules.splice(index, 1);
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
            // Templates still need to be fetched from disk (read-only op)
            const data = await buildPageView(selectedTemplatePath);
            const match = data.raw_content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                const templateData = jsyaml.load(match[1]) as any;
                // Construct current state to merge against
                const currentState = {
                    title,
                    subtitle,
                    tags,
                    images,
                    customFields,
                    layoutRules,
                };
                const merged = mergeTemplateState(currentState, templateData);
                initializeForm(merged);
                activeTab = "content"; // Switch back to see changes
            }
        } catch (e) {
            console.error(e);
            alert("Failed to load template.");
        }
    }

    // --- Save Logic ---

    function handleSave(shouldClose: boolean) {
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
                {#each [{ id: "content", icon: "file", label: "Content" }, { id: "images", icon: "image", label: "Images" }, { id: "structure", icon: "split", label: "Structure" }, { id: "templates", icon: "settings", label: "Templates" }] as tab}
                    <button
                        class:active={activeTab === tab.id}
                        onclick={() => (activeTab = tab.id as any)}
                    >
                        <Icon type={tab.icon as any} />
                        {tab.label}
                    </button>
                {/each}
            </div>

            <!-- Tab Content -->
            <div class="tab-content custom-scrollbar">
                <!-- === CONTENT TAB === -->
                {#if activeTab === "content"}
                    <div class="form-section">
                        <div class="form-group">
                            <label for="field-title">Title</label>
                            <input
                                id="field-title"
                                type="text"
                                bind:value={title}
                                placeholder="Page Title"
                                class="input-text"
                            />
                        </div>
                        <div class="form-group">
                            <label for="field-subtitle"
                                >Subtitle (Optional)</label
                            >
                            <input
                                id="field-subtitle"
                                type="text"
                                bind:value={subtitle}
                                placeholder="Subtitle"
                                class="input-text"
                            />
                        </div>

                        <!-- Tag Manager -->
                        <div class="form-group">
                            <label for="field-tags">Tags</label>
                            <div class="tag-input-container">
                                <div class="tag-list">
                                    {#each tags as tag}
                                        <span class="tag-pill"
                                            >#{tag}
                                            <button
                                                class="tag-remove"
                                                onclick={() => removeTag(tag)}
                                                >×</button
                                            ></span
                                        >
                                    {/each}
                                </div>
                                <!-- Uses SmartInput for tag suggestions -->
                                <div class="smart-input-container">
                                    <!-- Use 'autocomplete' mode for adding tags -->
                                    <SmartInput
                                        mode="autocomplete"
                                        placeholder="Add tag..."
                                        options={$worldTags.map((t) => t[0])}
                                        onEnter={addTag}
                                        value=""
                                        className="tag-input-field-wrapper"
                                    />
                                </div>
                            </div>
                            <small class="helper-text"
                                >Enter to select, Shift+Enter to create new.</small
                            >
                        </div>

                        <div class="separator-line"></div>

                        <!-- Custom Fields -->
                        <div class="custom-fields-header">
                            <h4>Custom Fields</h4>
                            <Button size="small" onclick={addField}
                                >+ Add Field</Button
                            >
                        </div>

                        <div class="fields-list">
                            {#each customFields as field, i (field.id)}
                                <InfoboxFieldRow
                                    bind:field={customFields[i]}
                                    isFirst={i === 0}
                                    isLast={i === customFields.length - 1}
                                    onMove={(dir) =>
                                        handleMove(customFields, i, dir)}
                                    onDelete={() => removeField(i)}
                                    allFiles={$allFileTitles}
                                    allImages={$allImageFiles}
                                />
                            {/each}
                            {#if customFields.length === 0}
                                <div class="empty-state">
                                    No custom fields added yet.
                                </div>
                            {/if}
                        </div>
                    </div>

                    <!-- === IMAGES TAB === -->
                {:else if activeTab === "images"}
                    <div class="form-section">
                        <p class="helper-text">
                            Add multiple images to create a carousel.
                        </p>
                        {#each images as img, i (img.id)}
                            <div class="image-card">
                                <div class="image-preview-box">
                                    {#if imagePreviews[img.id]}
                                        <img
                                            src={imagePreviews[img.id]}
                                            alt="preview"
                                        />
                                    {:else}
                                        <div class="empty-icon">
                                            <Icon type="image" />
                                        </div>
                                    {/if}
                                </div>
                                <div class="image-details">
                                    <div class="autocomplete-wrapper">
                                        <label for="img-src-{img.id}"
                                            >Source</label
                                        >
                                        <!-- Use 'autocomplete' mode for image files -->
                                        <SmartInput
                                            mode="autocomplete"
                                            bind:value={img.src}
                                            options={$allImageFiles}
                                            placeholder="my-image.png"
                                            id="img-src-{img.id}"
                                        />
                                    </div>
                                    <label for="img-cap-{img.id}"
                                        >Caption <span class="sub-label"
                                            >(Optional)</span
                                        ></label
                                    >
                                    <input
                                        id="img-cap-{img.id}"
                                        type="text"
                                        class="input-text"
                                        bind:value={img.caption}
                                        placeholder="Caption..."
                                    />
                                </div>
                                <div class="image-actions">
                                    <button
                                        class="move-btn"
                                        onclick={() =>
                                            handleMove(images, i, -1)}
                                        disabled={i === 0}>▲</button
                                    >
                                    <button
                                        class="move-btn"
                                        onclick={() => handleMove(images, i, 1)}
                                        disabled={i === images.length - 1}
                                        >▼</button
                                    >
                                    <button
                                        class="delete-btn"
                                        onclick={() => removeImage(i)}
                                        ><Icon type="close" /></button
                                    >
                                </div>
                            </div>
                        {/each}
                        <Button onclick={addImage}>+ Add Image</Button>
                    </div>

                    <!-- === STRUCTURE TAB === -->
                {:else if activeTab === "structure"}
                    <div class="form-section">
                        <p class="helper-text">
                            Define visual structure rules.
                        </p>
                        <div class="structure-toolbar">
                            <Button
                                size="small"
                                onclick={() => addLayoutRule("header")}
                                >+ Header</Button
                            >
                            <Button
                                size="small"
                                onclick={() => addLayoutRule("separator")}
                                >+ Separator</Button
                            >
                            <Button
                                size="small"
                                onclick={() => addLayoutRule("columns")}
                                >+ Columns</Button
                            >
                        </div>
                        <div class="fields-list">
                            {#each layoutRules as rule, i (rule.id)}
                                <div class="field-card rule-card">
                                    <div class="field-drag-handle">
                                        <button
                                            class="move-btn"
                                            onclick={() =>
                                                handleMove(layoutRules, i, -1)}
                                            disabled={i === 0}>▲</button
                                        >
                                        <button
                                            class="move-btn"
                                            onclick={() =>
                                                handleMove(layoutRules, i, 1)}
                                            disabled={i ===
                                                layoutRules.length - 1}
                                            >▼</button
                                        >
                                    </div>
                                    <div class="field-main">
                                        <div class="rule-header">
                                            <span
                                                class="rule-type-badge type-{rule.type}"
                                                >{rule.type.toUpperCase()}</span
                                            >
                                            <button
                                                class="delete-btn"
                                                onclick={() =>
                                                    removeLayoutRule(i)}
                                                ><Icon type="close" /></button
                                            >
                                        </div>
                                        <div class="rule-body">
                                            {#if rule.type === "header"}
                                                <input
                                                    type="text"
                                                    class="input-text"
                                                    bind:value={rule.text}
                                                    placeholder="Header Text"
                                                    aria-label="Header Text"
                                                />
                                            {/if}
                                            {#if rule.type === "columns"}
                                                <input
                                                    type="text"
                                                    class="input-text"
                                                    value={rule.keys?.join(
                                                        ", ",
                                                    )}
                                                    oninput={(e) =>
                                                        (rule.keys =
                                                            e.currentTarget.value
                                                                .split(",")
                                                                .map((s) =>
                                                                    s.trim(),
                                                                ))}
                                                    placeholder="keys, separated, by, comma"
                                                    aria-label="Column Keys"
                                                />
                                            {:else}
                                                <div style="min-width: 200px;">
                                                    <SearchableSelect
                                                        options={customFields.map(
                                                            (f) => f.key,
                                                        )}
                                                        bind:value={rule.above}
                                                        placeholder="Place Above..."
                                                    />
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>

                    <!-- === TEMPLATES TAB === -->
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
                        disabled={isSaving}>Apply</Button
                    >
                    <Button
                        variant="primary"
                        onclick={() => handleSave(true)}
                        disabled={isSaving}>Save & Close</Button
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
        min-width: 0; /* Helps flex containers handle text overflow properly */
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .sub-label {
        font-weight: normal;
        text-transform: none;
        font-style: italic;
    }

    .input-text,
    .value-input,
    .dropdown-select {
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-primary);
        padding: 0.6rem;
        border-radius: 6px;
        font-size: 0.95rem;
        width: 100%;
        box-sizing: border-box;
    }
    .input-text:focus,
    .value-input:focus {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: -1px;
    }

    /* --- Tags --- */
    .tag-input-container {
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-secondary);
        border-radius: 6px;
        padding: 0.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .tag-list {
        display: contents;
    }
    .tag-pill {
        background-color: var(--color-background-tertiary);
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-primary);
        padding: 0.2rem 0.6rem;
        border-radius: 99px;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }
    .tag-remove {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        font-size: 1.1rem;
        line-height: 0.8;
        color: var(--color-text-secondary);
    }
    .tag-remove:hover {
        color: var(--color-error);
    }

    .smart-input-container {
        flex-grow: 1;
        min-width: 120px;
    }
    /* Styles for the inner input of SmartInput when inside tag container */
    :global(.tag-input-field-wrapper .input-element) {
        border: none !important;
        background: transparent !important;
    }
    :global(.tag-input-field-wrapper .input-element:focus) {
        outline: none !important;
    }

    /* --- Custom Fields --- */
    .custom-fields-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .custom-fields-header h4 {
        margin: 0;
    }

    /* --- Images --- */
    .image-card {
        display: flex;
        gap: 1rem;
        padding: 1rem;
        background: var(--color-background-tertiary);
        border-radius: 8px;
        border: 1px solid var(--color-border-primary);
    }
    .image-preview-box {
        width: 80px;
        height: 80px;
        background: black;
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .image-preview-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .file-icon,
    .empty-icon {
        color: white;
        opacity: 0.5;
    }

    .image-details {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
    }
    .image-actions {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        justify-content: center;
    }

    .move-btn {
        background: none;
        border: none;
        font-size: 0.7rem;
        padding: 0.25rem;
        cursor: pointer;
        color: var(--color-text-secondary);
        opacity: 0.6;
    }
    .move-btn:hover:not(:disabled) {
        opacity: 1;
        color: var(--color-text-primary);
    }
    .move-btn:disabled {
        opacity: 0.2;
        cursor: default;
    }

    .delete-btn {
        background: none;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0.25rem;
    }
    .delete-btn:hover {
        color: var(--color-error);
    }

    /* --- Structure / Rules --- */
    .structure-toolbar {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .rule-card {
        display: flex;
        background: var(--color-overlay-light);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        margin-bottom: 0.75rem;
        overflow: hidden;
    }
    .field-drag-handle {
        background: var(--color-background-secondary);
        border-right: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0.25rem;
    }
    .field-main {
        flex-grow: 1;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
    }
    .rule-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    .rule-type-badge {
        font-size: 0.7rem;
        font-weight: bold;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        background: var(--color-text-secondary);
        color: var(--color-background-primary);
    }
    .type-header {
        background: var(--color-accent-primary);
        color: white;
    }
    .type-separator {
        background: var(--color-text-primary);
    }
    .rule-row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
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
    .separator-line {
        height: 1px;
        background: var(--color-border-primary);
        margin: 0.5rem 0;
    }
    .empty-state {
        text-align: center;
        padding: 2rem;
        color: var(--color-text-secondary);
        font-style: italic;
        background: var(--color-background-secondary);
        border-radius: 6px;
        border: 1px dashed var(--color-border-primary);
    }
    /* Helper for visually hiding labels that still need to be accessible */
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
