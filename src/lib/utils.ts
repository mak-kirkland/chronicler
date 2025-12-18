/**
 * @file A collection of generic, pure utility functions that can be used across
 * the entire frontend application. These functions are self-contained and do not
 * depend on Svelte stores or component lifecycle.
 */

import type { FileNode } from "./bindings";
import { resolveResource } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { InfoboxData, LayoutGroup, RenderItem } from "./types";

/** A list of common image file extensions. */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/**
 * A helper function to check if a FileNode is a directory.
 * @param node The FileNode to check.
 * @returns True if the node's file_type is 'Directory'.
 */
export function isDirectory(node: FileNode): boolean {
    return node.file_type === "Directory";
}

/**
 * A helper function to check if a FileNode is a Markdown file.
 * @param node The FileNode to check.
 * @returns True if the node's file_type is 'Markdown'.
 */
export function isMarkdown(node: FileNode): boolean {
    return node.file_type === "Markdown";
}

/**
 * A helper function to check if a FileNode is an image file.
 * @param node The FileNode to check.
 * @returns True if the node's file_type is 'Image'.
 */
export function isImage(node: FileNode): boolean {
    return node.file_type === "Image";
}

/**
 * Checks if a given path string points to a Markdown file based on its extension.
 * This is useful for client-side logic where we only have the path string.
 * @param path The file path string.
 * @returns True if the path ends with .md (case-insensitive).
 */
export function isMarkdownFile(path: string): boolean {
    return path.toLowerCase().endsWith(".md");
}

/**
 * Checks if a given path string points to a supported image file based on its extension.
 * @param path The file path string.
 * @returns True if the path has a recognized image extension.
 */
export function isImageFile(path: string): boolean {
    const extension = path.split(".").pop()?.toLowerCase();
    return extension ? IMAGE_EXTENSIONS.includes(extension) : false;
}

/**
 * Extracts a display-friendly title from a path or filename.
 * It strictly removes extensions only if they are known (.md or images).
 * This safely handles cases like:
 * - "My Note.md" -> "My Note" (Stripped)
 * - "My Note" -> "My Note" (Passthrough)
 * - "Mr. Husk" -> "Mr. Husk" (Passthrough, dot is preserved)
 * - "image.png" -> "image" (Stripped)
 * @param path The full path or filename.
 * @returns A clean title string.
 */
export function fileStemString(path: string): string {
    const fileName = path.split(/[\\/]/).pop() || "";

    // 1. Handle Markdown (Case-insensitive)
    // We need this because this function is also used on full paths (e.g. in links),
    // which DO have the .md extension.
    if (fileName.toLowerCase().endsWith(".md")) {
        return fileName.slice(0, -3);
    }

    // 2. Handle Images
    // We check against our known list. If it matches, we strip it.
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex > 0) {
        const ext = fileName.slice(lastDotIndex + 1).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
            return fileName.slice(0, lastDotIndex);
        }
    }

    // 3. Fallback: Return as-is.
    // This correctly handles "Mr. Husk" (folder) or "Chapter 1.5" (file without visible extension)
    return fileName;
}

/**
 * Recursively searches the file tree for a node with a matching path.
 * @param node The root FileNode to start searching from.
 * @param path The file path to search for.
 * @returns True if a matching file node is found, false otherwise.
 */
export function findFileInTree(node: FileNode | null, path: string): boolean {
    if (!node) return false;
    if (node.path === path) return true;
    if (node.children) {
        for (const child of node.children) {
            if (findFileInTree(child, path)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Recursively searches the file tree for a node whose path ends with a specific target string.
 * This is useful for finding nodes when absolute paths might vary but the relative structure is known.
 *
 * @param root The root FileNode to start searching from.
 * @param targetPath The path segment to match at the end of a node's full path (e.g. "_system/templates").
 * @returns The matching FileNode if found, otherwise undefined.
 */
export function findNodeByPath(
    root: FileNode | null,
    targetPath: string,
): FileNode | undefined {
    if (!root) return undefined;
    // Normalize paths to ensure consistent comparison (handling forward/backslashes)
    if (normalizePath(root.path).endsWith(targetPath)) return root;

    if (root.children) {
        for (const child of root.children) {
            const found = findNodeByPath(child, targetPath);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Recursively filters the file tree based on a search term, preserving directory structure.
 * @param node The root FileNode to start filtering from.
 * @param term The search term to filter by.
 * @returns A new FileNode representing the filtered tree, or null if no matches are found.
 */
export function filterFileTree(
    node: FileNode | null,
    term: string,
): FileNode | null {
    if (!node) return null;

    // If no search term, return the original node reference.
    // This prevents downstream components from thinking props have changed.
    if (!term) return node;

    const lowerCaseTerm = term.toLowerCase();

    if (isDirectory(node)) {
        // It's a directory. Filter its children.
        // node.children will be an array (possibly empty)
        const filteredChildren = (node.children || [])
            .map((child) => filterFileTree(child, term))
            .filter((child): child is FileNode => child !== null);

        // Keep the directory if its name matches OR it has children that match.
        if (
            node.name.toLowerCase().includes(lowerCaseTerm) ||
            filteredChildren.length > 0
        ) {
            return { ...node, children: filteredChildren };
        }
    } else {
        // It's a file. Check if its name matches.
        if (node.name.toLowerCase().includes(lowerCaseTerm)) {
            return node;
        }
    }

    // If we get here, it's a directory that doesn't match and has no matching children,
    // or a file that doesn't match.
    return null;
}

/**
 * Reads the content of a bundled application resource file.
 * @param filename The identifier of the resource (e.g., "help.md").
 */
export async function readBundledResource(filename: string): Promise<string> {
    try {
        const resourcePath = await resolveResource(filename);
        if (!resourcePath) {
            throw new Error(`Could not resolve path for resource: ${filename}`);
        }
        return await readTextFile(resourcePath);
    } catch (e) {
        console.error("Error in readBundledResource:", e);
        throw new Error(`Failed to read resource '${filename}': ${e}`);
    }
}

/**
 * Normalizes a path to use forward slashes, ensuring cross-platform consistency.
 * @param path The file path string.
 * @returns The normalized path string.
 */
export function normalizePath(path: string): string {
    return path.replace(/\\/g, "/");
}

/**
 * Capitalizes the first letter of a string, leaving the rest of the string unchanged.
 * Handles empty strings gracefully.
 * @param text The string to capitalize.
 * @returns The capitalized string, or an empty string if the input was empty.
 */
export function capitalizeFirstLetter(text: string): string {
    if (!text) {
        return "";
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Processes raw infobox data and applies layout rules to generate a structured
 * list of items for rendering.
 * @param data The raw InfoboxData object, which is the frontmatter.
 * @returns A structured array of `RenderItem` objects.
 */
export function buildInfoboxLayout(data: InfoboxData | null): RenderItem[] {
    if (!data) return [];

    const finalItems: RenderItem[] = [];
    // Ensure layout is an array
    const layout = Array.isArray(data.layout) ? data.layout : [];

    // --- 1. First Pass: Parse Rules ---
    // We build maps to know which items to inject/modify when iterating the data.

    const itemsAbove = new Map<string, RenderItem[]>();
    const itemsBelow = new Map<string, RenderItem[]>();
    const groupRules = new Map<string, LayoutGroup>();
    const keysInGroups = new Set<string>();
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
        // Register keys that should be renamed for display
        if (rule.type === "alias") {
            if (Array.isArray(rule.keys) && typeof rule.text === "string") {
                for (const key of rule.keys) {
                    aliasRules.set(key, rule.text);
                }
            }
            continue;
        }

        // B. Grouping Rules
        // Groups allow multiple keys to be displayed in a single row/grid.
        if (rule.type === "group" || rule.type === "columns") {
            if (Array.isArray(rule.keys) && rule.keys.length > 0) {
                // We register the group rule against the FIRST key in the list.
                // When the iterator hits this key, it will render the whole group.
                groupRules.set(rule.keys[0], rule);

                // We mark all SUBSEQUENT keys as being "in a group".
                // The iterator will skip these when it encounters them naturally.
                for (let i = 1; i < rule.keys.length; i++) {
                    keysInGroups.add(rule.keys[i]);
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

    // Define keys to exclude from the main list (metadata, special fields)
    const excludedKeys = new Set([
        "layout",
        "title",
        "image",
        "images",
        "image_captions",
        "image_paths",
        "tags",
        "infobox",
        "details",
        "error",
    ]);

    // We filter the entries first to ignore metadata
    const allEntries = Object.entries(data).filter(
        ([key]) => !excludedKeys.has(key),
    );

    for (const [key, value] of allEntries) {
        // If this key is part of a group but NOT the leader, skip it.
        // It will be rendered when the leader is processed.
        if (keysInGroups.has(key)) {
            continue;
        }

        // A. Inject items positioned "Above" this key
        if (itemsAbove.has(key)) {
            finalItems.push(...itemsAbove.get(key)!);
        }

        // B. Render the item itself
        if (groupRules.has(key)) {
            // It's the leader of a group.
            const rule = groupRules.get(key)!;
            // Gather values for all keys in the group
            const groupValues = rule.keys
                .map((k) => data[k])
                // Filter out undefined/null, but keep 0 or false
                .filter((v) => v !== undefined && v !== null && v !== "");

            // Only render the group if it has content
            if (groupValues.length > 0) {
                finalItems.push({ type: "group", items: groupValues });
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

/**
 * Calculates if a given hex color is considered "dark" based on HSP luminance.
 * @param color The hex color string (e.g., "#ffffff" or "000000").
 * @returns True if the color is considered dark, false otherwise.
 */
export function isColorDark(color: string): boolean {
    // Basic hex parsing/cleanup
    let hex = color.replace("#", "");
    if (hex.length === 3) {
        hex = hex
            .split("")
            .map((c) => c + c)
            .join("");
    }
    // Fallback for invalid colors or rgba (assume light for safety)
    if (hex.length !== 6) return false;

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // HSP equation from http://alienryderflex.com/hsp.html
    const hsp = Math.sqrt(
        0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b),
    );

    // Threshold of 127.5 is the mathematical midpoint, but 140 gives a better
    // "feel" for interfaces, defaulting to Dark Mode slightly earlier.
    return hsp < 140;
}
