/**
 * @file This file contains the core data structures and logic for parsing,
 * validating, manipulating, rendering, and saving Infobox data.
 *
 * It serves as the single source of truth for the "Infobox" feature module.
 */

import jsyaml from "js-yaml";
import { updatePageFrontmatter } from "$lib/commands";
import { TEMPLATE_FOLDER_PATH } from "$lib/config";
import {
    normalizePath,
    findNodeByPath,
    resolveImageSource,
    fileStemString,
} from "$lib/utils";
import type { FileNode } from "./bindings";

// --- Constants ---

/**
 * A comprehensive list of keys that have special meaning in the Infobox architecture.
 * These are excluded from being treated as generic "Custom Fields" in the editor
 * or "Default Items" in the renderer.
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
    "infobox", // Often used for legacy/debug flags
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
    | { type: "columns"; keys: string[] } // Renamed from 'group'
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
          type: "columns"; // Renamed from 'group'
          // This holds an array of the column's *values*
          items: any[];
      }
    | { type: "default"; item: [string, any] }; // A single default key-value pair

// --- 3. Editor Types (The Shape of Data in the UI) ---

export type FieldType = "text" | "link" | "spoiler" | "list" | "multiline";

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
    type: "header" | "separator" | "columns"; // Strictly 'columns' in Editor
    text?: string; // For headers
    above?: string; // Target field key
    below?: string; // Target field key (alternative)
    keys?: string[]; // For columns
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

    // We filter the entries first to ignore standard metadata
    const allEntries = Object.entries(data).filter(
        ([key]) => !RESERVED_INFOBOX_KEYS.has(key),
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
 * Parses raw YAML frontmatter data into a structured state object for the editor.
 * @param data The raw parsed YAML object.
 */
export function parseInfoboxData(data: any): InfoboxState {
    const title = data.title || "";
    const subtitle = data.subtitle || "";
    const tags = Array.isArray(data.tags) ? [...data.tags] : [];

    // Map layout rules, adding IDs for internal tracking.
    // We normalize 'group' to 'columns' here so the editor only deals with 'columns'.
    const layoutRules = (data.layout || []).map((rule: any) => {
        let type = rule.type;
        if (type === "group") type = "columns";

        return {
            ...rule,
            type,
            id: crypto.randomUUID(),
        };
    });

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
            // Skip reserved keys
            if (RESERVED_INFOBOX_KEYS.has(key)) return;

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
                    type = "link";
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

    return { title, subtitle, tags, images, customFields, layoutRules };
}

/**
 * Merges a template's parsed data into the current editor state.
 * This handles conflict resolution (preferring current state usually, or appending).
 */
export function mergeTemplateState(
    currentState: InfoboxState,
    templateData: any,
): InfoboxState {
    const templateState = parseInfoboxData(templateData);

    // 1. Merge simple fields if empty in current
    const title =
        currentState.title ||
        (templateData.title !== "{{title}}" ? templateState.title : "");
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
    // If a key exists in both, we keep the CURRENT value (don't overwrite user data),
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

// --- Logic: Persistence (Editor State -> YAML/String) ---

/**
 * Constructs a plain JavaScript object suitable for YAML dumping from the editor state.
 * @param state The current editor state.
 */
export function buildInfoboxYamlObject(state: InfoboxState): any {
    const obj: any = {};

    if (state.title) obj.title = state.title;
    if (state.subtitle) obj.subtitle = state.subtitle;

    // Images
    if (state.images.length > 0) {
        // Filter out empty src
        const validImages = state.images.filter((i) => i.src.trim() !== "");
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
    state.customFields.forEach((f) => {
        let val = f.value;
        if (f.type === "spoiler") {
            val = `||${f.value}||`;
        } else if (f.type === "link") {
            // Re-add brackets
            if (val && !val.startsWith("[[")) {
                val = `[[${val}]]`;
            }
        }
        // Normalize Key
        const safeKey = f.key.trim().toLowerCase().replace(/\s+/g, "_");
        if (safeKey) obj[safeKey] = val;
    });

    if (state.tags.length > 0) obj.tags = state.tags;

    // Layout
    if (state.layoutRules.length > 0) {
        obj.layout = state.layoutRules.map(({ id, ...rest }) => {
            const rule: any = { type: rest.type };
            // Editor uses 'columns', which maps directly to 'columns' in YAML now
            if (rest.text) rule.text = rest.text;
            if (rest.above) rule.above = rest.above;
            if (rest.below) rule.below = rest.below;
            if (rest.keys && rest.keys.length > 0) rule.keys = rest.keys;
            return rule;
        });
    }

    return obj;
}

/**
 * Applies the editor state to a full Markdown content string.
 * It replaces the existing frontmatter (or creates it) with the new state.
 *
 * @param content The original full markdown content.
 * @param state The new infobox state.
 * @returns The new markdown content string.
 */
export function applyInfoboxStateToContent(
    content: string,
    state: InfoboxState,
): string {
    const yamlObject = buildInfoboxYamlObject(state);
    const yamlString = jsyaml.dump(yamlObject, { lineWidth: -1 }).trim();
    const newFrontmatterBlock = `---\n${yamlString}\n---`;

    // Regex to find existing frontmatter
    // ^---\n([\s\S]*?)\n---
    const frontmatterRegex = /^---\n[\s\S]*?\n---/;

    if (frontmatterRegex.test(content)) {
        return content.replace(frontmatterRegex, newFrontmatterBlock);
    } else {
        // Prepend if no frontmatter exists
        return `${newFrontmatterBlock}\n\n${content}`;
    }
}

/**
 * Saves the editor state directly to disk (Legacy/Direct Mode).
 * Use `applyInfoboxStateToContent` for safer in-memory updates.
 */
export async function saveInfoboxState(
    filePath: string,
    state: InfoboxState,
): Promise<void> {
    // 1. Convert state to YAML-ready object
    const yamlObject = buildInfoboxYamlObject(state);

    // 2. Dump to string
    const yamlString = jsyaml.dump(yamlObject, { lineWidth: -1 });

    // 3. Write to file
    await updatePageFrontmatter(filePath, yamlString);
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
 * Resolves preview URLs for a list of image entries.
 * Handles both remote URLs (http) and local vault paths.
 */
export async function resolveAllImagePreviews(
    images: ImageEntry[],
    vaultPath: string,
): Promise<Record<string, string>> {
    const previews: Record<string, string> = {};

    await Promise.all(
        images.map(async (img) => {
            if (!img.src) return;
            if (img.src.startsWith("http")) {
                previews[img.id] = img.src;
            } else {
                // We use existing utility to resolve local paths
                const url = await resolveImageSource(img.src, vaultPath);
                previews[img.id] = url;
            }
        }),
    );

    return previews;
}

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
    type: "header" | "separator" | "columns",
): EditorLayoutRule {
    return {
        id: crypto.randomUUID(),
        type,
        text: type === "header" ? "Header" : undefined,
        above: "",
        keys: type === "columns" ? [] : undefined,
    };
}

// --- Autocomplete Logic ---

/**
 * Result of analyzing the text before a cursor for autocomplete triggers.
 */
export interface AutocompleteContext {
    type: "link" | "image";
    query: string;
    triggerLength: number;
    triggerIndex: number;
}

/**
 * Analyzes text preceding the cursor to determine if an autocomplete trigger (e.g. `[[` or `![[`) is active.
 * @param textBeforeCursor The text content up to the cursor position.
 * @returns An AutocompleteContext object if a trigger is found, or null.
 */
export function getAutocompleteContext(
    textBeforeCursor: string,
): AutocompleteContext | null {
    // Check for last occurrence of [[
    const lastOpen = textBeforeCursor.lastIndexOf("[[");

    // If found and not closed by ]] before cursor
    if (lastOpen !== -1 && !textBeforeCursor.slice(lastOpen).includes("]]")) {
        // Check if it's an image ![[
        const isImage = lastOpen > 0 && textBeforeCursor[lastOpen - 1] === "!";
        const triggerIndex = isImage ? lastOpen - 1 : lastOpen;
        const triggerLength = isImage ? 3 : 2;

        // The query is everything after the trigger
        const query = textBeforeCursor.slice(lastOpen + 2);

        // Safety: If newlines exist, assume we aren't in a link
        if (query.includes("\n")) {
            return null;
        }

        return {
            type: isImage ? "image" : "link",
            query,
            triggerLength,
            triggerIndex,
        };
    }
    return null;
}

/**
 * Generates a filtered list of suggestions based on the current input context.
 * @param query The search string.
 * @param type The type of suggestion needed.
 * @param existingTags The current file's tags (to exclude from suggestions).
 * @param allTags The global list of tags in the world. (Array of [tag, metadata])
 * @param allFiles The global list of file titles/paths.
 * @param allImages The global list of image files.
 * @returns An array of string suggestions.
 */
export function getAutocompleteSuggestions(
    query: string,
    type: "tag" | "link" | "image",
    existingTags: string[],
    allTags: [string, any][], // Corrected type: Array of entries where index 0 is tag name
    allFiles: string[],
    allImages: string[],
): string[] {
    let source: string[] = [];

    if (type === "tag") {
        // Filter out tags already applied to this file
        source = allTags
            .map((t) => t[0])
            .filter((t) => !existingTags.includes(t));
    } else if (type === "link") {
        source = allFiles;
    } else if (type === "image") {
        source = allImages;
    }

    // Limit results for performance
    const limit = 8;

    if (!query) {
        return source.slice(0, limit);
    }

    const lowerQuery = query.toLowerCase();
    return source
        .filter((item) => item.toLowerCase().includes(lowerQuery))
        .slice(0, limit);
}
