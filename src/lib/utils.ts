/**
 * @file A collection of generic, pure utility functions that can be used across
 * the entire frontend application. These functions are self-contained and do not
 * depend on Svelte stores or component lifecycle.
 */

import type { FileNode } from "./bindings";
import { resolveResource } from "@tauri-apps/api/path";
import { readTextFile } from "@tauri-apps/plugin-fs";

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
 * Extracts a display-friendly title from a file path.
 * It gets the last part of the path (the filename) and removes the .md extension if present.
 * @param path The full path to the file.
 * @returns A clean title string.
 */
export function getTitleFromPath(path: string): string {
    const fileName = path.split(/[\\/]/).pop() || "Untitled";
    // Use a regex to remove the .md extension only if it's at the end of the string.
    return fileName.replace(/\.md$/, "");
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
