/**
 * @file This file contains the core data structures and logic for parsing,
 * validating, and manipulating Infobox data (YAML frontmatter).
 */

// types for the editor state
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
    const tags = Array.isArray(data.tags) ? data.tags : [];

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

    return { title, subtitle, tags, images, customFields, layoutRules };
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
