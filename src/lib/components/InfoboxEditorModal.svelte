<script lang="ts">
    import { onMount, tick } from "svelte";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import Icon from "./Icon.svelte";
    import { updatePageFrontmatter, buildPageView } from "$lib/commands";
    import {
        allFileTitles,
        allImageFiles,
        files,
        vaultPath,
        tags as worldTags,
    } from "$lib/worldStore";
    import { normalizePath, findNodeByPath } from "$lib/utils";
    import { TEMPLATE_FOLDER_PATH } from "$lib/config";
    import jsyaml from "js-yaml";

    let { onClose, filePath, onSaveSuccess } = $props<{
        onClose: () => void;
        filePath: string;
        onSaveSuccess?: () => void;
    }>();

    // --- Types ---
    type FieldType = "text" | "wikilink" | "spoiler" | "list" | "multiline";

    interface EditorField {
        id: string;
        key: string;
        value: any;
        type: FieldType;
    }

    interface ImageEntry {
        id: string;
        src: string;
        caption: string;
    }

    interface LayoutRule {
        id: string;
        type: "header" | "separator" | "group";
        text?: string; // For headers
        above?: string; // Target field key
        below?: string; // Target field key (alternative)
        keys?: string[]; // For groups
    }

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
    let layoutRules = $state<LayoutRule[]>([]);

    // --- Autocomplete State ---
    let newTagInput = $state("");
    let activeAutocompleteType = $state<"tag" | "link" | "image" | null>(null);
    let focusedFieldId = $state<string | null>(null);
    let fieldSearchQuery = $state("");
    let dropdownPos = $state<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    let selectedIndex = $state(0);

    // Derived Suggestions
    const currentSuggestions = $derived.by(() => {
        if (!activeAutocompleteType || !fieldSearchQuery) return [];

        let source: string[] = [];
        if (activeAutocompleteType === "tag") {
            source = $worldTags
                .map((t) => t[0])
                .filter((t) => !tags.includes(t));
        } else if (activeAutocompleteType === "link") {
            source = $allFileTitles;
        } else if (activeAutocompleteType === "image") {
            source = $allImageFiles;
        }

        return source
            .filter((t) =>
                t.toLowerCase().includes(fieldSearchQuery.toLowerCase()),
            )
            .slice(0, 8);
    });

    // Reset index when suggestions change or list shrinks
    $effect(() => {
        if (
            currentSuggestions.length > 0 &&
            selectedIndex >= currentSuggestions.length
        ) {
            selectedIndex = 0;
        }
    });

    // Templates
    let availableTemplates = $derived.by(() => {
        if (!$vaultPath || !$files) return [];
        const tPath = normalizePath(`${$vaultPath}/${TEMPLATE_FOLDER_PATH}`);
        const node = findNodeByPath($files, tPath);
        return node?.children?.filter((c) => c.file_type === "Markdown") || [];
    });
    let selectedTemplatePath = $state("");

    // --- Initialization ---

    onMount(async () => {
        try {
            const data = await buildPageView(filePath);
            const rawContent = data.raw_content;
            const match = rawContent.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                const parsed = jsyaml.load(match[1]) as any;
                initializeForm(parsed);
            }
        } catch (e) {
            console.error("Failed to load file data", e);
            alert("Could not load file data.");
            onClose();
        } finally {
            isLoading = false;
        }
    });

    function initializeForm(data: any) {
        title = data.title || "";
        subtitle = data.subtitle || "";
        tags = Array.isArray(data.tags) ? data.tags : [];

        // Map layout rules, adding IDs for internal tracking
        layoutRules = (data.layout || []).map((rule: any) => ({
            ...rule,
            id: crypto.randomUUID(),
        }));

        // Parse Images
        images = [];
        if (data.image) {
            const rawImgs = Array.isArray(data.image)
                ? data.image
                : [data.image];
            rawImgs.forEach((item: any) => {
                if (Array.isArray(item)) {
                    images.push({
                        id: crypto.randomUUID(),
                        src: item[0],
                        caption: item[1] || "",
                    });
                } else {
                    images.push({
                        id: crypto.randomUUID(),
                        src: item,
                        caption: "",
                    });
                }
            });
        }

        // Parse Custom Fields
        customFields = [];
        const ignoredKeys = new Set([
            "title",
            "subtitle",
            "tags",
            "image",
            "layout",
            "infobox",
        ]);

        Object.entries(data).forEach(([key, value]) => {
            if (ignoredKeys.has(key)) return;

            let type: FieldType = "text";
            let val = value;

            if (Array.isArray(value)) {
                type = "list";
            } else if (typeof value === "string") {
                if (value.startsWith("||") && value.endsWith("||")) {
                    type = "spoiler";
                    val = value.slice(2, -2);
                } else if (value.includes("\n")) {
                    type = "multiline";
                } else if (value.startsWith("[[") && value.endsWith("]]")) {
                    type = "wikilink";
                    // Strip brackets for cleaner editing
                    val = value.slice(2, -2);
                }
            }

            customFields.push({
                id: crypto.randomUUID(),
                key,
                value: val,
                type,
            });
        });
    }

    // --- Actions ---

    // TAGS
    function addTag(tagToAdd: string = newTagInput) {
        const cleaned = tagToAdd.trim();
        if (cleaned && !tags.includes(cleaned)) {
            tags.push(cleaned);
            newTagInput = "";
            closeSuggestions();
        }
    }

    function removeTag(tag: string) {
        tags = tags.filter((t) => t !== tag);
    }

    // FIELDS
    function addField() {
        customFields.push({
            id: crypto.randomUUID(),
            key: "New Field",
            value: "",
            type: "text",
        });
    }

    function removeField(index: number) {
        customFields.splice(index, 1);
    }

    function moveField(index: number, direction: -1 | 1) {
        if (index + direction < 0 || index + direction >= customFields.length)
            return;
        const temp = customFields[index];
        customFields[index] = customFields[index + direction];
        customFields[index + direction] = temp;
    }

    // IMAGES
    function addImage() {
        images.push({ id: crypto.randomUUID(), src: "", caption: "" });
    }

    function removeImage(index: number) {
        images.splice(index, 1);
    }

    function moveImage(index: number, direction: -1 | 1) {
        if (index + direction < 0 || index + direction >= images.length) return;
        const temp = images[index];
        images[index] = images[index + direction];
        images[index + direction] = temp;
    }

    // LAYOUT RULES
    function addLayoutRule(type: "header" | "separator" | "group") {
        layoutRules.push({
            id: crypto.randomUUID(),
            type,
            text: type === "header" ? "Header" : undefined,
            above: "",
            keys: type === "group" ? [] : undefined,
        });
    }

    function removeLayoutRule(index: number) {
        layoutRules.splice(index, 1);
    }

    function moveLayoutRule(index: number, direction: -1 | 1) {
        if (index + direction < 0 || index + direction >= layoutRules.length)
            return;
        const temp = layoutRules[index];
        layoutRules[index] = layoutRules[index + direction];
        layoutRules[index + direction] = temp;
    }

    // TEMPLATES
    async function applyTemplate() {
        if (!selectedTemplatePath) return;
        if (
            !confirm(
                "Merge template fields? Existing values may be overwritten.",
            )
        )
            return;

        try {
            const data = await buildPageView(selectedTemplatePath);
            const match = data.raw_content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                const templateData = jsyaml.load(match[1]) as any;
                if (templateData.title === "{{title}}")
                    delete templateData.title;

                const currentObj = constructYamlObject();
                // Simple shallow merge
                const merged = { ...currentObj, ...templateData };
                initializeForm(merged);
                activeTab = "content"; // Switch back to see changes
            }
        } catch (e) {
            console.error(e);
            alert("Failed to load template.");
        }
    }

    // --- Autocomplete Logic ---

    function handleInputFocus(
        e: FocusEvent,
        type: "tag" | "link" | "image",
        id: string | null = null,
        val: string = "",
    ) {
        activeAutocompleteType = type;
        focusedFieldId = id;
        fieldSearchQuery = val;
        updateDropdownPosition(e.target as HTMLElement);
        selectedIndex = 0;
    }

    function handleInputInput(
        e: Event,
        type: "tag" | "link" | "image",
        id: string | null = null,
    ) {
        const target = e.target as HTMLInputElement;
        fieldSearchQuery = target.value;
        activeAutocompleteType = type;
        focusedFieldId = id;

        // Ensure position tracks with input if it moves slightly
        updateDropdownPosition(target);

        // Reset selection on typing
        selectedIndex = 0;
    }

    function updateDropdownPosition(element: HTMLElement) {
        const rect = element.getBoundingClientRect();
        dropdownPos = {
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
        };
    }

    function handleInputKeydown(e: KeyboardEvent) {
        // Only handle nav keys if we have suggestions showing
        if (!activeAutocompleteType || currentSuggestions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex =
                (selectedIndex - 1 + currentSuggestions.length) %
                currentSuggestions.length;
        } else if (e.key === "Enter") {
            e.preventDefault();
            confirmSuggestion(currentSuggestions[selectedIndex]);
        } else if (e.key === "Escape") {
            closeSuggestions();
        } else if (e.key === "Tab") {
            e.preventDefault();
            confirmSuggestion(currentSuggestions[selectedIndex]);
        }
    }

    function confirmSuggestion(val: string) {
        if (activeAutocompleteType === "tag") {
            addTag(val);
        } else if (activeAutocompleteType === "link") {
            const field = customFields.find((f) => f.id === focusedFieldId);
            if (field) field.value = val;
        } else if (activeAutocompleteType === "image") {
            const img = images.find((i) => i.id === focusedFieldId);
            if (img) img.src = val;
        }
        closeSuggestions();
    }

    function closeSuggestions() {
        activeAutocompleteType = null;
        dropdownPos = null;
        focusedFieldId = null;
        selectedIndex = 0;
    }

    function handleScroll() {
        if (activeAutocompleteType) closeSuggestions();
    }

    // --- Save Logic ---

    function constructYamlObject() {
        const obj: any = {};

        if (title) obj.title = title;
        if (subtitle) obj.subtitle = subtitle;

        // Images
        if (images.length > 0) {
            // Filter out empty src
            const validImages = images.filter((i) => i.src.trim() !== "");
            if (validImages.length > 0) {
                if (validImages.length === 1 && !validImages[0].caption) {
                    obj.image = validImages[0].src;
                } else {
                    const hasCaptions = validImages.some((i) => i.caption);
                    if (hasCaptions) {
                        obj.image = validImages.map((i) =>
                            i.caption ? [i.src, i.caption] : [i.src],
                        );
                    } else {
                        obj.image = validImages.map((i) => i.src);
                    }
                }
            }
        }

        // Fields
        customFields.forEach((f) => {
            let val = f.value;
            if (f.type === "spoiler") {
                val = `||${f.value}||`;
            } else if (f.type === "wikilink") {
                // Re-add brackets
                if (val && !val.startsWith("[[")) {
                    val = `[[${val}]]`;
                }
            }
            // Normalize Key
            const safeKey = f.key.trim().toLowerCase().replace(/\s+/g, "_");
            if (safeKey) obj[safeKey] = val;
        });

        if (tags.length > 0) obj.tags = tags;

        // Layout
        if (layoutRules.length > 0) {
            obj.layout = layoutRules.map(({ id, ...rest }) => {
                const rule: any = { type: rest.type };
                if (rest.text) rule.text = rest.text;
                if (rest.above) rule.above = rest.above;
                if (rest.below) rule.below = rest.below;
                if (rest.keys && rest.keys.length > 0) rule.keys = rest.keys;
                return rule;
            });
        }

        return obj;
    }

    async function handleSave(shouldClose: boolean) {
        isSaving = true;
        const obj = constructYamlObject();
        const yamlString = jsyaml.dump(obj, { lineWidth: -1 });

        try {
            await updatePageFrontmatter(filePath, yamlString);

            // Critical: Always call success to trigger world reload
            if (onSaveSuccess) await onSaveSuccess();

            if (shouldClose) {
                onClose();
            }
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
            <p>Parsing Frontmatter...</p>
        </div>
    {:else}
        <div class="editor-container">
            <!-- Tabs -->
            <div class="tabs-header">
                <button
                    class:active={activeTab === "content"}
                    onclick={() => (activeTab = "content")}
                >
                    <Icon type="file" /> Content
                </button>
                <button
                    class:active={activeTab === "images"}
                    onclick={() => (activeTab = "images")}
                >
                    <Icon type="image" /> Images
                </button>
                <button
                    class:active={activeTab === "structure"}
                    onclick={() => (activeTab = "structure")}
                >
                    <Icon type="split" /> Structure
                </button>
                <button
                    class:active={activeTab === "templates"}
                    onclick={() => (activeTab = "templates")}
                >
                    <Icon type="settings" /> Templates
                </button>
            </div>

            <!-- Tab Content (Scrollable) -->
            <div class="tab-content custom-scrollbar" onscroll={handleScroll}>
                <!-- === CONTENT TAB === -->
                {#if activeTab === "content"}
                    <div class="form-section">
                        <div class="form-group">
                            <label>Title</label>
                            <input
                                type="text"
                                bind:value={title}
                                placeholder="Page Title"
                                class="input-text"
                            />
                        </div>
                        <div class="form-group">
                            <label>Subtitle</label>
                            <input
                                type="text"
                                bind:value={subtitle}
                                placeholder=""
                                class="input-text"
                            />
                        </div>

                        <!-- Tag Manager -->
                        <div class="form-group">
                            <label>Tags</label>
                            <div class="tag-input-container">
                                <div class="tag-list">
                                    {#each tags as tag}
                                        <span class="tag-pill">
                                            #{tag}
                                            <button
                                                class="tag-remove"
                                                onclick={() => removeTag(tag)}
                                                >×</button
                                            >
                                        </span>
                                    {/each}
                                </div>
                                <input
                                    type="text"
                                    bind:value={newTagInput}
                                    placeholder="Add tag..."
                                    class="tag-input-field"
                                    onfocus={(e) =>
                                        handleInputFocus(
                                            e,
                                            "tag",
                                            null,
                                            newTagInput,
                                        )}
                                    oninput={(e) => handleInputInput(e, "tag")}
                                    onkeydown={(e) => {
                                        if (
                                            e.key === "Enter" &&
                                            !activeAutocompleteType
                                        ) {
                                            e.preventDefault();
                                            addTag();
                                        } else {
                                            handleInputKeydown(e);
                                        }
                                    }}
                                />
                            </div>
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
                                <div class="field-card">
                                    <div class="field-drag-handle">
                                        <button
                                            class="move-btn"
                                            onclick={() => moveField(i, -1)}
                                            disabled={i === 0}>▲</button
                                        >
                                        <button
                                            class="move-btn"
                                            onclick={() => moveField(i, 1)}
                                            disabled={i ===
                                                customFields.length - 1}
                                            >▼</button
                                        >
                                    </div>

                                    <div class="field-main">
                                        <div class="field-row-top">
                                            <input
                                                type="text"
                                                class="key-input"
                                                bind:value={field.key}
                                                placeholder="Field Name (e.g. Age)"
                                            />
                                            <select
                                                class="type-select"
                                                bind:value={field.type}
                                            >
                                                <option value="text"
                                                    >Text</option
                                                >
                                                <option value="wikilink"
                                                    >Link</option
                                                >
                                                <option value="spoiler"
                                                    >Spoiler</option
                                                >
                                                <option value="multiline"
                                                    >Long Text</option
                                                >
                                                <option value="list"
                                                    >List</option
                                                >
                                            </select>
                                            <button
                                                class="delete-btn"
                                                onclick={() => removeField(i)}
                                                title="Remove field"
                                            >
                                                <Icon type="close" />
                                            </button>
                                        </div>

                                        <div class="field-value-row">
                                            {#if field.type === "multiline"}
                                                <textarea
                                                    bind:value={field.value}
                                                    rows="2"
                                                    class="value-input"
                                                    placeholder="Value..."
                                                ></textarea>
                                            {:else if field.type === "list"}
                                                <input
                                                    type="text"
                                                    class="value-input"
                                                    value={field.value}
                                                    oninput={(e) =>
                                                        (field.value =
                                                            e.currentTarget.value.split(
                                                                ",",
                                                            ))}
                                                    placeholder="Item 1, Item 2..."
                                                />
                                            {:else}
                                                <input
                                                    type="text"
                                                    class="value-input"
                                                    bind:value={field.value}
                                                    placeholder={field.type ===
                                                    "wikilink"
                                                        ? "Page Name"
                                                        : "Value..."}
                                                    onfocus={(e) =>
                                                        field.type ===
                                                            "wikilink" &&
                                                        handleInputFocus(
                                                            e,
                                                            "link",
                                                            field.id,
                                                            field.value,
                                                        )}
                                                    oninput={(e) =>
                                                        field.type ===
                                                            "wikilink" &&
                                                        handleInputInput(
                                                            e,
                                                            "link",
                                                            field.id,
                                                        )}
                                                    onkeydown={handleInputKeydown}
                                                    onblur={() =>
                                                        setTimeout(
                                                            closeSuggestions,
                                                            200,
                                                        )}
                                                />
                                            {/if}
                                        </div>
                                    </div>
                                </div>
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
                            Add multiple images to create a carousel in the
                            infobox.
                        </p>

                        {#each images as img, i (img.id)}
                            <div class="image-card">
                                <div class="image-preview-box">
                                    {#if img.src}
                                        {#if img.src.startsWith("http")}
                                            <img src={img.src} alt="preview" />
                                        {:else}
                                            <div class="file-icon">
                                                <Icon type="image" />
                                            </div>
                                        {/if}
                                    {:else}
                                        <div class="empty-icon">
                                            <Icon type="image" />
                                        </div>
                                    {/if}
                                </div>

                                <div class="image-details">
                                    <div class="autocomplete-wrapper">
                                        <label>Source Filename or URL</label>
                                        <input
                                            type="text"
                                            class="input-text"
                                            bind:value={img.src}
                                            placeholder="my-image.png"
                                            onfocus={(e) =>
                                                handleInputFocus(
                                                    e,
                                                    "image",
                                                    img.id,
                                                    img.src,
                                                )}
                                            oninput={(e) =>
                                                handleInputInput(
                                                    e,
                                                    "image",
                                                    img.id,
                                                )}
                                            onkeydown={handleInputKeydown}
                                            onblur={() =>
                                                setTimeout(
                                                    closeSuggestions,
                                                    200,
                                                )}
                                        />
                                    </div>

                                    <label
                                        >Caption <span class="sub-label"
                                            >(Optional)</span
                                        ></label
                                    >
                                    <input
                                        type="text"
                                        class="input-text"
                                        bind:value={img.caption}
                                        placeholder="e.g. 'Map of the City'"
                                    />
                                </div>

                                <div class="image-actions">
                                    <button
                                        class="move-btn"
                                        onclick={() => moveImage(i, -1)}
                                        disabled={i === 0}>▲</button
                                    >
                                    <button
                                        class="move-btn"
                                        onclick={() => moveImage(i, 1)}
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
                            Define visual structure rules. These inject headers
                            and separators relative to your fields.
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
                                onclick={() => addLayoutRule("group")}
                                >+ Group</Button
                            >
                        </div>

                        <div class="fields-list">
                            {#each layoutRules as rule, i (rule.id)}
                                <div class="field-card rule-card">
                                    <div class="field-drag-handle">
                                        <button
                                            class="move-btn"
                                            onclick={() =>
                                                moveLayoutRule(i, -1)}
                                            disabled={i === 0}>▲</button
                                        >
                                        <button
                                            class="move-btn"
                                            onclick={() => moveLayoutRule(i, 1)}
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
                                                />
                                            {/if}

                                            <div class="rule-row">
                                                {#if rule.type === "group"}
                                                    <label>Group Keys:</label>
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
                                                        placeholder="field1, field2"
                                                    />
                                                {:else}
                                                    <label>Place Above:</label>
                                                    <select
                                                        class="type-select"
                                                        bind:value={rule.above}
                                                    >
                                                        <option value=""
                                                            >Select Field...</option
                                                        >
                                                        {#each customFields as f}
                                                            <option
                                                                value={f.key}
                                                                >{f.key}</option
                                                            >
                                                        {/each}
                                                    </select>
                                                {/if}
                                            </div>
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
                                Merge fields from an existing template into this
                                page.
                            </p>
                            <div class="split-row">
                                <select
                                    class="dropdown-select"
                                    bind:value={selectedTemplatePath}
                                >
                                    <option value=""
                                        >Select a template...</option
                                    >
                                    {#each availableTemplates as t}
                                        <option value={t.path}>{t.title}</option
                                        >
                                    {/each}
                                </select>
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

            <!-- FIXED AUTOCOMPLETE DROPDOWN -->
            {#if activeAutocompleteType && currentSuggestions.length > 0 && dropdownPos}
                <div
                    class="fixed-dropdown"
                    style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px;"
                >
                    <ul class="suggestions-list">
                        {#each currentSuggestions as s, i}
                            <li class:selected={i === selectedIndex}>
                                <button onmousedown={() => confirmSuggestion(s)}
                                    >{s}</button
                                >
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
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

    .tag-input-field {
        background: transparent;
        border: none;
        color: var(--color-text-primary);
        font-size: 0.9rem;
        flex-grow: 1;
        min-width: 80px;
    }
    .tag-input-field:focus {
        outline: none;
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

    .field-card {
        display: flex;
        background: var(--color-background-tertiary);
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

    .field-main {
        flex-grow: 1;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0; /* Prevents overflow from children */
    }
    .field-row-top {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .key-input {
        flex: 1;
        background: transparent;
        border: none;
        border-bottom: 1px dashed var(--color-border-primary);
        font-weight: bold;
        color: var(--color-text-primary);
        padding: 0.25rem;
        min-width: 0; /* Allow shrinking */
    }
    .key-input:focus {
        outline: none;
        border-bottom-style: solid;
        border-bottom-color: var(--color-accent-primary);
    }

    .type-select {
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-secondary);
        border-radius: 4px;
        padding: 0.2rem;
        font-size: 0.8rem;
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

    /* --- Structure / Rules --- */
    .structure-toolbar {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .rule-card {
        background: var(--color-overlay-light);
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

    /* --- Autocomplete Dropdown (Fixed) --- */
    .fixed-dropdown {
        position: fixed;
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        max-height: 250px;
        overflow-y: auto;
        z-index: 9999;
    }

    .suggestions-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .suggestions-list li button {
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        padding: 0.6rem 1rem;
        color: var(--color-text-primary);
        cursor: pointer;
        font-size: 0.9rem;
    }
    .suggestions-list li.selected button,
    .suggestions-list li button:hover {
        background: var(--color-accent-primary);
        color: white;
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
</style>
