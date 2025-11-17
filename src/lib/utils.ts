/**
 * @file A collection of generic, pure utility functions that can be used across
 * the entire frontend application. These functions are self-contained and do not
 * depend on Svelte stores or component lifecycle.
 */

import type { FileNode } from "./bindings";
import { resolveResource } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type {
    InfoboxData,
    LayoutGroup,
    LayoutItem,
    RenderItem,
} from "./types";

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
 * Extracts a display-friendly title (the file stem) from a file path.
 * It gets the last part of the path (the filename) and removes the final extension.
 * @param path The full path or filename.
 * @returns A clean title string without the extension.
 */
export function fileStemString(path: string): string {
    const fileName = path.split(/[\\/]/).pop() || "Untitled";
    const lastDotIndex = fileName.lastIndexOf(".");

    // Check if a dot exists and it's not the first character (to handle hidden files)
    if (lastDotIndex < 1) {
        return fileName;
    }

    return fileName.slice(0, lastDotIndex);
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

    // 1. Get all renderable key-value pairs from the frontmatter, preserving
    //    their original order as defined in the YAML file.
    const allEntries = Object.entries(data).filter(
        ([key]) => !excludedKeys.has(key),
    );
    const layout = data.layout;
    const finalItems: RenderItem[] = [];
    const processedKeys = new Set<string>();
    // 2. Pre-process layout rules into Maps for efficient O(1) lookups.
    //    This avoids re-iterating the layout array for every frontmatter key.
    // Generic maps for any "positioned" items (headers, separators, etc.)
    const aboveRules = new Map<string, LayoutItem[]>();
    const belowRules = new Map<string, LayoutItem[]>();
    // Specific map for groups, as they are processed differently.
    const groupRules = new Map<string, LayoutGroup>();

    if (layout && Array.isArray(layout)) {
        for (const rule of layout) {
            if (rule.type === "header" || rule.type === "separator") {
                if (rule.position?.above) {
                    const key = rule.position.above;
                    if (!aboveRules.has(key)) aboveRules.set(key, []);
                    aboveRules.get(key)!.push(rule);
                } else if (rule.position?.below) {
                    const key = rule.position.below;
                    if (!belowRules.has(key)) belowRules.set(key, []);
                    belowRules.get(key)!.push(rule);
                }
            } else if (rule.type === "group" && rule.keys?.length > 0) {
                // A group rule is triggered by its *first* key.
                groupRules.set(rule.keys[0], rule);
            }
        }
    }

    /**
     * Helper function to push positioned rules (headers, separators)
     * onto the final render list.
     */
    function pushPositionedRules(rules: LayoutItem[]) {
        for (const rule of rules) {
            if (rule.type === "header") {
                finalItems.push({ type: "header", text: rule.text });
            } else if (rule.type === "separator") {
                finalItems.push({ type: "separator" });
            }
        }
    }

    // 3. Iterate through the original frontmatter entries to build the final
    //    render list, applying the injection rules as we go.
    for (const [key, value] of allEntries) {
        // Skip this key if it was already rendered as part of a group.
        if (processedKeys.has(key)) {
            continue;
        }

        // INJECTION POINT 1: Check for 'above' rules
        if (aboveRules.has(key)) {
            pushPositionedRules(aboveRules.get(key)!);
        }

        // INJECTION POINT 2: Check if this key is the trigger for a group.
        if (groupRules.has(key)) {
            const rule = groupRules.get(key)!;
            const groupValues: any[] = [];

            // Collect all values specified in the group rule.
            for (const groupKey of rule.keys) {
                if (data[groupKey] !== undefined) {
                    groupValues.push(data[groupKey]);
                    processedKeys.add(groupKey); // Mark key as processed.
                }
            }
            finalItems.push({
                type: "group",
                render_as: rule.render_as,
                items: groupValues,
            });
            // INJECTION POINT 3 (Groups): Check for 'below' rules on the *last*
            // key of the group.
            const lastKeyInGroup = rule.keys[rule.keys.length - 1];
            if (belowRules.has(lastKeyInGroup)) {
                pushPositionedRules(belowRules.get(lastKeyInGroup)!);
            }
        } else {
            // If the key is not part of any special rule, render it as a default item.
            finalItems.push({ type: "default", item: [key, value] });

            // INJECTION POINT 3 (Default): Check for 'below' rules.
            if (belowRules.has(key)) {
                pushPositionedRules(belowRules.get(key)!);
            }
        }
    }
    return finalItems;
}
