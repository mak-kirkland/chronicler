/**
 * @file This file contains the core data structures and logic for parsing,
 * validating, manipulating, rendering, and saving Infobox data.
 *
 * This version uses the 'yaml' library to manipulate the Concrete Syntax Tree
 * (CST) of the frontmatter. This ensures that comments, formatting, and
 * unsupported fields (like nested objects) are preserved when the user saves
 * changes from the UI.
 */

import {
    parseDocument,
    Document,
    isMap,
    isSeq,
    YAMLSeq,
    type Node,
} from "yaml";
import { TEMPLATE_FOLDER_PATH } from "$lib/config";
import { normalizePath, findNodeByPath, fileStemString } from "$lib/utils";
import type { FileNode } from "./bindings";

// --- Constants ---

/**
 * A comprehensive list of keys that have special meaning in the Infobox architecture.
 * These are excluded from being treated as generic "Custom Fields" in the editor
 * or "Default Items" in the renderer.
 *
 * "infobox" is explicitly excluded from this list so that it can be picked up
 * by the editor as a generic Custom Field (allowing the user to edit the sub-header text).
 * However, we must manually exclude it in the renderer (buildInfoboxLayout) so it
 * doesn't appear as a duplicate field.
 */
export const RESERVED_INFOBOX_KEYS = new Set([
    "title",
    "subtitle",
    "tags",
    "image",
    "images",
    "image_captions",
    "image_paths",
    "layout",
    // "infobox" handled as a custom field for editing purposes
    "details", // Error details
    "error", // Error messages
]);

// --- 1. Data Types (The Shape of Data on Disk) ---

/**
 * The raw data structure representing the YAML frontmatter of a page.
 */
export interface InfoboxFrontmatter {
    layout?: InfoboxLayoutRule[];
    [key: string]: any;
}

/**
 * A layout rule as it appears in the YAML `layout` array.
 */
export type InfoboxLayoutRule =
    | { type: "header"; text: string; above?: string; below?: string }
    | {
          type: "separator";
          above?: string | string[];
          below?: string | string[];
      }
    | { type: "columns"; keys: string[] }
    | { type: "alias"; keys: string[]; text: string }
    | { type: "group"; keys: string[] }; // Legacy support

// --- 2. Render Types (The Shape of Data for the View) ---

/**
 * A union type representing the final, structured items to be rendered by the infobox component.
 */
export type RenderItem =
    | { type: "header"; text: string }
    | { type: "separator" }
    | {
          type: "columns";
          // This holds an array of the column's *values*
          items: any[];
      }
    | { type: "default"; item: [string, any] }; // A single default key-value pair

// --- 3. Editor Types (The Shape of Data in the UI) ---

export type FieldType = "text" | "list";

export interface EditorField {
    id: string; // Unique ID for UI lists (drag-drop)
    key: string;
    value: any;
    type: FieldType;
}

export interface ImageEntry {
    id: string;
    src: string;
    caption: string;
}

export interface EditorLayoutRule {
    id: string;
    type: "header" | "separator" | "columns" | "alias";
    text?: string; // For headers and aliases
    above: string | string[]; // Target field key(s)
    below: string | string[]; // Target field key(s) (alternative)
    keys?: string[]; // For columns and aliases
}

export interface InfoboxState {
    title: string;
    subtitle: string;
    tags: string[];
    images: ImageEntry[];
    customFields: EditorField[];
    layoutRules: EditorLayoutRule[];
}

// --- Logic: Rendering (YAML -> View List) ---

/**
 * Processes raw infobox data and applies layout rules to generate a structured
 * list of items for rendering.
 * @param data The raw InfoboxFrontmatter object.
 * @returns A structured array of `RenderItem` objects.
 */
export function buildInfoboxLayout(
    data: InfoboxFrontmatter | null,
): RenderItem[] {
    if (!data) return [];

    const finalItems: RenderItem[] = [];
    // Ensure layout is an array
    const layout = Array.isArray(data.layout) ? data.layout : [];

    // --- 1. First Pass: Parse Rules ---
    // We build maps to know which items to inject/modify when iterating the data.

    const itemsAbove = new Map<string, RenderItem[]>();
    const itemsBelow = new Map<string, RenderItem[]>();

    // Explicitly type the map to store only rules that have 'keys'
    const columnRules = new Map<
        string,
        { type: "columns" | "group"; keys: string[] }
    >();

    const keysInColumns = new Set<string>();
    const aliasRules = new Map<string, string>();

    // Helper to register items to be injected above/below a target key
    const registerInjection = (
        targetKey: string | string[],
        item: RenderItem,
        map: Map<string, RenderItem[]>,
    ) => {
        const targets = Array.isArray(targetKey) ? targetKey : [targetKey];
        for (const target of targets) {
            if (!map.has(target)) {
                map.set(target, []);
            }
            map.get(target)!.push({ ...item }); // push a copy
        }
    };

    for (const rule of layout) {
        // Protect against malformed YAML (nulls, strings, numbers)
        if (!rule || typeof rule !== "object") continue;

        // A. Alias Rules
        if (rule.type === "alias") {
            if (Array.isArray(rule.keys) && typeof rule.text === "string") {
                for (const key of rule.keys) {
                    aliasRules.set(key, rule.text);
                }
            }
            continue;
        }

        // B. Column/Group Rules
        // "columns" allows multiple keys to be displayed in a single row/grid.
        // We support "group" for legacy backward compatibility.
        if (rule.type === "columns" || rule.type === "group") {
            if (Array.isArray(rule.keys) && rule.keys.length > 0) {
                // We register the rule against the FIRST key in the list.
                // When the iterator hits this key, it will render the whole set.
                columnRules.set(rule.keys[0], rule);

                // We mark all SUBSEQUENT keys as being "inside" the layout.
                // The iterator will skip these when it encounters them naturally.
                for (let i = 1; i < rule.keys.length; i++) {
                    keysInColumns.add(rule.keys[i]);
                }
            }
            continue;
        }

        // C. Injection Rules (Headers & Separators)
        if (rule.type === "header") {
            if (rule.above) {
                registerInjection(
                    rule.above,
                    { type: "header", text: rule.text },
                    itemsAbove,
                );
            }
            if (rule.below) {
                registerInjection(
                    rule.below,
                    { type: "header", text: rule.text },
                    itemsBelow,
                );
            }
        } else if (rule.type === "separator") {
            if (rule.above) {
                registerInjection(
                    rule.above,
                    { type: "separator" },
                    itemsAbove,
                );
            }
            if (rule.below) {
                registerInjection(
                    rule.below,
                    { type: "separator" },
                    itemsBelow,
                );
            }
        }
    }

    // --- 2. Second Pass: Iterate Data & Construct Layout ---

    // We filter the entries first to ignore standard metadata.
    // We explicitly filter out "infobox" here. It is allowed in the Editor (so it's not in RESERVED_KEYS),
    // but in the Render View, it has its own dedicated header slot, so we don't want it appearing in the generic list.
    const allEntries = Object.entries(data).filter(
        ([key]) => !RESERVED_INFOBOX_KEYS.has(key) && key !== "infobox",
    );

    for (const [key, value] of allEntries) {
        // If this key is part of a column layout but NOT the leader, skip it.
        if (keysInColumns.has(key)) {
            continue;
        }

        // A. Inject items positioned "Above" this key
        if (itemsAbove.has(key)) {
            finalItems.push(...itemsAbove.get(key)!);
        }

        // B. Render the item itself
        if (columnRules.has(key)) {
            // It's the leader of a column set.
            const rule = columnRules.get(key)!;
            // Gather values for all keys defined in the rule
            const groupValues = rule.keys
                .map((k: string) => data[k])
                // Filter out undefined/null, but keep 0 or false
                .filter((v: any) => v !== undefined && v !== null && v !== "");

            // Only render if it has content
            if (groupValues.length > 0) {
                finalItems.push({ type: "columns", items: groupValues });
            }
        } else {
            // It's a standard key-value pair.
            // Check if there is an alias for this key.
            const label = aliasRules.has(key) ? aliasRules.get(key)! : key;

            // Render it as a default item.
            finalItems.push({ type: "default", item: [label, value] });
        }

        // C. Inject items positioned "Below" this key
        if (itemsBelow.has(key)) {
            finalItems.push(...itemsBelow.get(key)!);
        }
    }

    return finalItems;
}

// --- Logic: Parsing (YAML -> Editor State) ---

/**
 * Parses raw YAML content string into a structured state object for the editor.
 * Uses the 'yaml' library to ensure we can handle the string input robustly.
 * @param yamlContent The raw string content of the frontmatter (or file).
 */
export function parseInfoboxContent(yamlContent: string): InfoboxState {
    let data: any = {};

    try {
        // If the content is full file content with delimiters, extract them
        const match = yamlContent.match(/^---\n([\s\S]*?)\n---/);
        const frontmatter = match ? match[1] : yamlContent;

        // Parse into a JS object for the Editor to consume
        const doc = parseDocument(frontmatter);
        data = doc.toJSON() || {};
    } catch (e) {
        console.warn("Failed to parse YAML for editor:", e);
        // Fallback to empty
        data = {};
    }

    const title = data.title || "";
    const subtitle = data.subtitle || "";
    const tags = Array.isArray(data.tags) ? [...data.tags] : [];

    // Map layout rules, adding IDs for internal tracking.
    // We normalize 'group' to 'columns' here so the editor only deals with 'columns'.
    const layoutRules: EditorLayoutRule[] = [];

    for (const rule of data.layout || []) {
        if (!rule || typeof rule !== "object") continue;

        let type = rule.type;
        if (type === "group") type = "columns";

        layoutRules.push({
            ...rule,
            type,
            id: crypto.randomUUID(),
            // Ensure fields exist for binding.
            // Preserve array-valued above/below (used by separators).
            above: rule.above || (type === "separator" ? [] : ""),
            below: rule.below || (type === "separator" ? [] : ""),
        });
    }

    // Parse Images
    const images: ImageEntry[] = [];
    if (data.image) {
        const rawImgs = Array.isArray(data.image) ? data.image : [data.image];
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
    const customFields: EditorField[] = [];
    if (data) {
        Object.entries(data).forEach(([key, value]) => {
            if (RESERVED_INFOBOX_KEYS.has(key)) return;

            // -- PRESERVATION STRATEGY --
            // If the value is a complex object (like { nested: 1 }) which our editor
            // does not support, we intentionally SKIP adding it to customFields.
            // When we save back later, we only touch fields that are IN customFields.
            // This ensures complex data remains untouched in the file.

            let type: FieldType = "text";
            let val = value;

            if (Array.isArray(value)) {
                type = "list";
            } else if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
            ) {
                // Convert primitives to string for the text input
                type = "text";
                val = String(value);
            } else {
                // Unknown complex type (object/null/undefined) -> Skip import
                return;
            }

            customFields.push({
                id: crypto.randomUUID(),
                key,
                value: val,
                type,
            });
        });
    }

    return { title, subtitle, tags, images, customFields, layoutRules };
}

/**
 * Merges a template's data into the current editor state.
 * @param currentState The existing state in the editor.
 * @param templateContent The raw string content of the template file.
 */
export function mergeTemplateState(
    currentState: InfoboxState,
    templateContent: string,
): InfoboxState {
    const templateState = parseInfoboxContent(templateContent);

    // 1. Merge Title/Subtitle (prefer current unless empty)
    const title =
        currentState.title ||
        (templateState.title !== "{{title}}" ? templateState.title : "");
    const subtitle = currentState.subtitle || templateState.subtitle;

    // 2. Merge Tags (Union)
    const tags = Array.from(
        new Set([...currentState.tags, ...templateState.tags]),
    );

    // 3. Append Images
    const images = [...currentState.images, ...templateState.images];

    // 4. Merge Layout Rules (Append)
    const layoutRules = [
        ...currentState.layoutRules,
        ...templateState.layoutRules,
    ];

    // 5. Merge Custom Fields
    // If a key exists in both, keep the CURRENT value (don't overwrite user data),
    // unless the current value is empty and template has one.
    const mergedFields = [...currentState.customFields];
    const currentKeys = new Set(mergedFields.map((f) => f.key));

    templateState.customFields.forEach((tf) => {
        if (!currentKeys.has(tf.key)) {
            mergedFields.push(tf);
        }
    });

    return {
        title,
        subtitle,
        tags,
        images,
        customFields: mergedFields,
        layoutRules,
    };
}

// --- Logic: Persistence (Editor State -> CST -> String) ---

/**
 * Applies the editor state to the original file content string using Non-Destructive editing.
 *
 * It parses the original frontmatter into a Concrete Syntax Tree (CST), modifies only the
 * nodes that have changed, and returns the new string. This preserves comments and formatting.
 *
 * @param originalContent The full file content (including --- delimiters).
 * @param state The new state from the editor.
 * @returns The new full file content string.
 */
export function applyInfoboxStateToContent(
    originalContent: string,
    state: InfoboxState,
): string {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = originalContent.match(frontmatterRegex);

    let doc: Document;
    let body = originalContent;

    // 1. Load existing structure if present
    if (match) {
        doc = parseDocument(match[1]);
        // Extract body to append later
        body = originalContent.replace(frontmatterRegex, "").trimStart();
    } else {
        doc = new Document({});
        // If no frontmatter existed, the whole content is the body
        body = originalContent.trimStart();
    }

    // --- Helpers for CST Manipulation ---

    /** Safely sets a value. If val is empty/undefined, it deletes the key. */
    const setOrDelete = (key: string, val: any) => {
        if (
            val === undefined ||
            val === null ||
            val === "" ||
            (Array.isArray(val) && val.length === 0)
        ) {
            doc.delete(key);
        } else {
            doc.set(key, val);
        }
    };

    // --- Update Core Fields ---

    setOrDelete("title", state.title);
    setOrDelete("subtitle", state.subtitle);

    // Tags: Force flow style [a, b] for compactness
    if (state.tags.length > 0) {
        const tagNode = doc.createNode(state.tags);
        tagNode.flow = true;
        doc.set("tags", tagNode);
    } else {
        doc.delete("tags");
    }

    // Images: Construct the complex image value
    if (state.images.length > 0) {
        const validImages = state.images.filter((i) => i.src.trim() !== "");
        if (validImages.length > 0) {
            let imageValue: any;

            if (validImages.length === 1 && !validImages[0].caption) {
                // Case: Single image, no caption -> Just the string
                imageValue = validImages[0].src;
            } else {
                // Case: Multiple or captioned -> Array
                const hasCaptions = validImages.some((i) => i.caption);
                if (hasCaptions) {
                    // [[src, cap], [src, cap]]
                    imageValue = validImages.map((i) =>
                        i.caption ? [i.src, i.caption] : [i.src],
                    );
                } else {
                    // [src, src]
                    imageValue = validImages.map((i) => i.src);
                }
            }

            const imgNode = doc.createNode(imageValue);
            // Explicitly cast to YAMLSeq to access 'flow' if it's a sequence
            if (Array.isArray(imageValue) && imgNode instanceof YAMLSeq) {
                imgNode.flow = true;
            }
            doc.set("image", imgNode);
        } else {
            doc.delete("image");
        }
    } else {
        doc.delete("image");
    }

    // Layout
    if (state.layoutRules.length > 0) {
        const layoutData = state.layoutRules.map(({ id, ...rest }) => {
            const rule: any = { type: rest.type };
            if (rest.text) rule.text = rest.text;

            // Serialize above/below — support both string and string[]
            if (rest.above) {
                if (Array.isArray(rest.above)) {
                    const cleaned = rest.above.map((s) => s.trim()).filter(Boolean);
                    if (cleaned.length > 0) rule.above = cleaned;
                } else {
                    const trimmed = rest.above.trim();
                    if (trimmed) rule.above = trimmed;
                }
            }
            if (rest.below) {
                if (Array.isArray(rest.below)) {
                    const cleaned = rest.below.map((s) => s.trim()).filter(Boolean);
                    if (cleaned.length > 0) rule.below = cleaned;
                } else {
                    const trimmed = rest.below.trim();
                    if (trimmed) rule.below = trimmed;
                }
            }

            if (rest.keys && rest.keys.length > 0) {
                rule.keys = rest.keys.map((k) => k.trim());
            }
            return rule;
        });

        // We want the main list to be Block style (- item),
        // but inner arrays (keys: [A, B], above: [x, y]) to be Flow style.
        const layoutNode = doc.createNode(layoutData);
        if (isSeq(layoutNode)) {
            layoutNode.items.forEach((item) => {
                if (isMap(item)) {
                    for (const prop of ["keys", "above", "below"]) {
                        const node = item.get(prop, true) as Node;
                        if (node && isSeq(node)) {
                            node.flow = true;
                        }
                    }
                }
            });
        }
        doc.set("layout", layoutNode);
    } else {
        doc.delete("layout");
    }

    // --- Update Custom Fields ---
    const editorKeys = new Set(state.customFields.map((f) => f.key.trim()));

    // A. Detect Deletions & Remove stale keys (Non-Destructive)
    // We traverse existing keys in the doc. If a key is NOT in editorKeys,
    // we need to decide if the user deleted it, or if we just never loaded it (complex object).
    // We also delete keys that ARE in editorKeys so we can re-add them in editor
    // order in step B.
    if (isMap(doc.contents)) {
        // Get all keys currently in the YAML CST
        const existingKeys = doc.contents.items.map((pair: any) =>
            String(pair.key.value),
        );

        for (const key of existingKeys) {
            // Ignored keys are managed elsewhere
            if (RESERVED_INFOBOX_KEYS.has(key)) continue;

            // If the key is in the editor, remove it now — it will be re-added
            // in the correct order in step B.
            if (editorKeys.has(key)) {
                doc.delete(key);
                continue;
            }

            // It is NOT in the editor. Did the user delete it?
            const val = doc.get(key);

            // Check if it's a "Supported Type" that we would have loaded.
            const isSupported =
                val === null ||
                typeof val === "string" ||
                typeof val === "number" ||
                typeof val === "boolean" ||
                // Check for standard sequence (array)
                (isSeq(doc.contents.get(key, true)) && !isMap(val)); // Rough check: is list and not map

            // If it was supported, but isn't in editorKeys, the user deleted it.
            if (isSupported) {
                doc.delete(key);
            }

            // If it was NOT supported (e.g. nested map), we do NOTHING.
            // It stays in the doc, preserving data we can't edit.
        }
    }

    // B. Re-add fields in editor order
    // Because we deleted all editor-managed keys in step A, doc.set() will
    // append them, preserving the order the user arranged in the editor.
    for (const field of state.customFields) {
        const key = field.key.trim();
        if (!key) continue;

        let valToSet: any = field.value;

        // If list type, ensure array and set flow style
        if (field.type === "list" && Array.isArray(field.value)) {
            const listNode = doc.createNode(field.value);
            listNode.flow = true;
            valToSet = listNode;
        }

        doc.set(key, valToSet);
    }

    const newFrontmatter = doc.toString().trim();
    // Reconstruct file
    if (newFrontmatter) {
        return `---\n${newFrontmatter}\n---\n\n${body}`;
    } else {
        return body; // No frontmatter left
    }
}

// --- Generic Array Helpers ---

/**
 * Moves an item in an array up or down by one position.
 * Returns a new array copy.
 */
export function reorderArrayItem<T>(
    array: T[],
    index: number,
    direction: -1 | 1,
): T[] {
    const newArray = [...array];
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= newArray.length) {
        return newArray;
    }

    [newArray[index], newArray[targetIndex]] = [
        newArray[targetIndex],
        newArray[index],
    ];

    return newArray;
}

// --- Async Data Resolvers ---

/**
 * Fetches available markdown templates from the configured template folder.
 * Returns an array of objects containing the full path and a display label.
 * @param files The array of root FileNodes from the world store.
 */
export function getAvailableTemplates(
    files: any[], // We use any[] here to avoid circular type dependency issues if FileNode isn't perfectly aligned
    vaultPath: string,
): { path: string; label: string }[] {
    if (!files || !vaultPath) return [];

    const tPath = normalizePath(`${vaultPath}/${TEMPLATE_FOLDER_PATH}`);

    // files is a list of root nodes. We need to find which one contains the template path.
    let node: FileNode | undefined = undefined;

    // Handle case where files might be a single node (unlikely but safe)
    const fileArray = Array.isArray(files) ? files : [files];

    for (const root of fileArray) {
        node = findNodeByPath(root, tPath);
        if (node) break;
    }

    const templates =
        node?.children?.filter((c: any) => c.file_type === "Markdown") || [];

    return templates.map((t: any) => ({
        path: t.path,
        label: t.name || fileStemString(t.path) || "Untitled Template",
    }));
}

// --- State Factory Helpers ---

export function createField(): EditorField {
    return {
        id: crypto.randomUUID(),
        key: "New Field",
        value: "",
        type: "text",
    };
}

export function createImage(): ImageEntry {
    return {
        id: crypto.randomUUID(),
        src: "",
        caption: "",
    };
}

export function createLayoutRule(
    type: "header" | "separator" | "columns" | "alias",
): EditorLayoutRule {
    return {
        id: crypto.randomUUID(),
        type,
        text: type === "header" || type === "alias" ? "" : undefined,
        above: type === "separator" ? [] : "",
        below: type === "separator" ? [] : "",
        keys: type === "columns" || type === "alias" ? [] : undefined,
    };
}
