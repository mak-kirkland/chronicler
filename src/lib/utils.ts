/**
 * @file A collection of generic, pure utility functions that can be used across
 * the entire frontend application. These functions are self-contained and do not
 * depend on Svelte stores or component lifecycle.
 */

import type { FileNode } from "./bindings";
import { resolveResource } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { InfoboxData, LayoutGroup, LayoutItem, RenderItem } from "./types";

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
    if (!data || typeof data !== "object") {
        return [];
    }

    // Define keys that are handled by dedicated UI elements (like the title,
    // image carousel, and tags) and should be excluded from the main data list.
    const excludedKeys = new Set([
        "title",
        "subtitle",
        "tags",
        "infobox",
        "images",
        "image_paths",
        "image_captions",
        "error",
        "details", // Error details
        "layout", // The layout key itself is for rules, not display.
    ]);

    // The final list we will give to the UI
    const finalItems: RenderItem[] = [];
    const processedKeys = new Set<string>();

    // Maps to hold rules associated with specific keys
    // key -> list of items to inject BEFORE this key
    const aboveRules = new Map<string, RenderItem[]>();
    // key -> list of items to inject AFTER this key
    const belowRules = new Map<string, RenderItem[]>();
    // key -> the group definition that starts at this key
    const groupRules = new Map<string, LayoutGroup>();

    /** Helper to register an item in the injection maps */
    const addInjection = (
        target: string | string[] | undefined,
        item: RenderItem,
        map: Map<string, RenderItem[]>,
    ) => {
        if (!target) return;
        const targets = Array.isArray(target) ? target : [target];
        for (const t of targets) {
            if (!map.has(t)) map.set(t, []);
            map.get(t)!.push(item);
        }
    };

    // 1. Pre-process Layout Rules
    if (data.layout && Array.isArray(data.layout)) {
        for (const rule of data.layout) {
            // Protect against malformed YAML (nulls, strings, numbers)
            if (!rule || typeof rule !== "object") continue;
            // Case A: Header
            if (rule.type === "header") {
                const item: RenderItem = { type: "header", text: rule.text };
                addInjection(rule.above, item, aboveRules);
                addInjection(rule.below, item, belowRules);
            }
            // Case B: Separator (Can be an array)
            else if (rule.type === "separator") {
                const item: RenderItem = { type: "separator" };
                addInjection(rule.above, item, aboveRules);
                addInjection(rule.below, item, belowRules);
            }
            // Case C: Groups OR Columns
            else if (
                (rule.type === "group" || rule.type === "columns") &&
                rule.keys?.length > 0
            ) {
                // Register the group logic against the FIRST key in the group.
                groupRules.set(rule.keys[0], rule);
            }
            // Case D: Simple Strings (ignored in this pass, handled implicitly by order)
        }
    }

    // 2. Iterate Data Entries
    const allEntries = Object.entries(data).filter(
        ([key]) => !excludedKeys.has(key),
    );

    for (const [key, value] of allEntries) {
        // Skip if this key was already consumed by a group
        if (processedKeys.has(key)) continue;

        // A. Inject items positioned "Above" this key
        if (aboveRules.has(key)) {
            finalItems.push(...aboveRules.get(key)!);
        }

        // B. Render Content (Group or Default)
        if (groupRules.has(key)) {
            const rule = groupRules.get(key)!;
            const groupValues: any[] = [];
            let lastKeyInGroup = key; // Track the last key for "Below" injections

            // Collect all values specified in the group rule.
            for (const groupKey of rule.keys) {
                if (data[groupKey] !== undefined) {
                    groupValues.push(data[groupKey]);
                    processedKeys.add(groupKey); // Mark key as processed.
                    lastKeyInGroup = groupKey;
                }
            }

            // Only render group if it has data
            if (groupValues.length > 0) {
                finalItems.push({
                    type: "group",
                    items: groupValues,
                });
            }

            // Check if there are injections below the *last* key of the group
            // (Since the group "consumes" the space of all its keys)
            if (belowRules.has(lastKeyInGroup)) {
                finalItems.push(...belowRules.get(lastKeyInGroup)!);
            }
        } else {
            // If the key is not part of any special rule, render it as a default item.
            finalItems.push({ type: "default", item: [key, value] });

            // C. Inject items positioned "Below" this key
            if (belowRules.has(key)) {
                finalItems.push(...belowRules.get(key)!);
            }
        }
    }

    return finalItems;
}
