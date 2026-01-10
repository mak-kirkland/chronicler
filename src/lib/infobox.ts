/**
 * @file This file contains the core data structures and logic for parsing,
 * validating, manipulating, and saving Infobox data.
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

// --- Types ---

export type FieldType = "text" | "wikilink" | "spoiler" | "list" | "multiline";

export interface EditorField {
    id: string;
    key: string;
    value: any;
    type: FieldType;
}

export interface ImageEntry {
    id: string;
    src: string;
    caption: string;
}

export interface LayoutRule {
    id: string;
    type: "header" | "separator" | "group";
    text?: string; // For headers
    above?: string; // Target field key
    below?: string; // Target field key (alternative)
    keys?: string[]; // For groups
}

export interface InfoboxState {
    title: string;
    subtitle: string;
    tags: string[];
    images: ImageEntry[];
    customFields: EditorField[];
    layoutRules: LayoutRule[];
}

/**
 * Parses raw YAML frontmatter data into a structured state object for the editor.
 * @param data The raw parsed YAML object.
 */
export function parseInfoboxData(data: any): InfoboxState {
    const title = data.title || "";
    const subtitle = data.subtitle || "";
    const tags = Array.isArray(data.tags) ? [...data.tags] : [];

    // Map layout rules, adding IDs for internal tracking
    const layoutRules = (data.layout || []).map((rule: any) => ({
        ...rule,
        id: crypto.randomUUID(),
    }));

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
    const ignoredKeys = new Set([
        "title",
        "subtitle",
        "tags",
        "image",
        "layout",
        "infobox",
    ]);

    if (data) {
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

    if (state.tags.length > 0) obj.tags = state.tags;

    // Layout
    if (state.layoutRules.length > 0) {
        obj.layout = state.layoutRules.map(({ id, ...rest }) => {
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
 */
export function getAvailableTemplates(
    files: any[], // Typed as any[] to decouple from specific FileNode type, but expects node structure
    vaultPath: string,
): { path: string; label: string }[] {
    if (!files || !vaultPath) return [];

    const tPath = normalizePath(`${vaultPath}/${TEMPLATE_FOLDER_PATH}`);
    const node = findNodeByPath(files, tPath);

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
    type: "header" | "separator" | "group",
): LayoutRule {
    return {
        id: crypto.randomUUID(),
        type,
        text: type === "header" ? "Header" : undefined,
        above: "",
        keys: type === "group" ? [] : undefined,
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
 * @param allTags The global list of tags in the world.
 * @param allFiles The global list of file titles/paths.
 * @param allImages The global list of image files.
 * @returns An array of string suggestions.
 */
export function getAutocompleteSuggestions(
    query: string,
    type: "tag" | "link" | "image",
    existingTags: string[],
    allTags: string[][],
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

// --- Persistence Logic ---

/**
 * Saves the editor state to the physical file frontmatter.
 * @param filePath The path of the file to update.
 * @param state The current editor state.
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
