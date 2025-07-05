import type { FileNode } from './bindings';

/**
 * Extracts a display-friendly title from a file path.
 * It gets the last part of the path (the filename) and removes the .md extension if present.
 * @param path The full path to the file.
 * @returns A clean title string.
 */
export function getTitleFromPath(path: string): string {
	const fileName = path.split(/[\\/]/).pop() || 'Untitled';
	// Use a regex to remove the .md extension only if it's at the end of the string.
	return fileName.replace(/\.md$/, '');
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
export function filterFileTree(node: FileNode | null, term: string): FileNode | null {
	if (!node) return null;
	const lowerCaseTerm = term.toLowerCase();

	// If it's a file, check if its name matches the search term.
	if (!node.children) {
		return node.name.toLowerCase().includes(lowerCaseTerm) ? node : null;
	}

	// If it's a directory, filter its children recursively.
	const filteredChildren = node.children
		.map((child) => filterFileTree(child, term))
		.filter((child): child is FileNode => child !== null); // Keep only non-null results

	// A directory should be kept if its name matches or if it has any children left after filtering.
	if (node.name.toLowerCase().includes(lowerCaseTerm) || filteredChildren.length > 0) {
		return { ...node, children: filteredChildren };
	}

	return null;
}
