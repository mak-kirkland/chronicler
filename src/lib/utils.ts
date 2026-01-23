/**
 * @file A collection of generic, pure utility functions that can be used across
 * the entire frontend application. These functions are self-contained and do not
 * depend on Svelte stores or component lifecycle.
 */

import type { FileNode } from "./bindings";
import { resolveResource } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getImageAsBase64 } from "./commands";

/** A list of common image file extensions. */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/** A list of image extensions that support transparency. */
const TRANSPARENT_EXTENSIONS = ["png", "webp", "svg", "gif", "avif"];

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
 * Checks if a given path string points to an image format that supports transparency.
 * @param path The file path or URL string.
 * @returns True if the extension is known to support transparency.
 */
export function supportsTransparency(path: string): boolean {
    const extension = path.split(".").pop()?.toLowerCase();
    return extension ? TRANSPARENT_EXTENSIONS.includes(extension) : false;
}

/**
 * Determines the best way to load an image based on its location.
 *
 * - If the file is inside the current Vault, we use the fast, zero-copy Asset Protocol (`convertFileSrc`).
 * - If the file is outside the Vault, we fall back to the slower IPC Base64 method (`getImageAsBase64`).
 *
 * @param path The absolute path to the image file.
 * @param vaultPath The absolute path to the currently open vault.
 * @returns A Promise resolving to a string URL (either `asset://...` or `data:image/...`).
 */
export async function resolveImageSource(
    path: string,
    vaultPath: string | null,
): Promise<string> {
    if (vaultPath && path.startsWith(vaultPath)) {
        // Fast path for in-vault images
        return convertFileSrc(path);
    } else {
        // Slower IPC path for external images
        return await getImageAsBase64(path);
    }
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
 * @param showImages Whether to include image files in the result.
 * @returns A new FileNode representing the filtered tree, or null if no matches are found.
 */
export function filterFileTree(
    node: FileNode | null,
    term: string,
    showImages: boolean = true,
): FileNode | null {
    if (!node) return null;

    // Filter out images if the setting is disabled
    if (!showImages && isImage(node)) {
        return null;
    }

    // If no search term and images are allowed (or handled above),
    // return the original node reference to avoid re-renders.
    // However, if we need to filter *children* (recursion), we must proceed.
    // For a file, if we are here, it's either not an image or showImages is true.
    if (!term && !isDirectory(node)) {
        return node;
    }
    // If it's a directory and there is no search term, we still need to recurse
    // because some children might be images that need hiding.

    const lowerCaseTerm = term.toLowerCase();

    if (isDirectory(node)) {
        // It's a directory. Filter its children.
        // node.children will be an array (possibly empty)
        const filteredChildren = (node.children || [])
            .map((child) => filterFileTree(child, term, showImages))
            .filter((child): child is FileNode => child !== null);

        // Keep the directory if:
        // 1. Its name matches the search term
        // 2. OR it has children that match (or are visible)
        // 3. AND if there is NO search term, we generally keep directories unless empty?
        //    Actually, if term is empty, we just want to show the structure minus hidden files.
        //    If term is present, we only show matching branches.

        if (!term) {
            // No search term: keep directory, just update children
            // We return a new object to ensure Svelte reactivity triggers if children changed
            return { ...node, children: filteredChildren };
        }

        // Search term present:
        if (
            node.name.toLowerCase().includes(lowerCaseTerm) ||
            filteredChildren.length > 0
        ) {
            return { ...node, children: filteredChildren };
        }
    } else {
        // It's a file. We already checked !showImages above.
        // Now check if its name matches the search term.
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
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));

    // Threshold of 127.5 is the mathematical midpoint, but 140 gives a better
    // "feel" for interfaces, defaulting to Dark Mode slightly earlier.
    return hsp < 140;
}
