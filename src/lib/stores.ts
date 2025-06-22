import type { FileNode, PageHeader } from './bindings';
import { writable, type Writable } from 'svelte/store';

// Using Svelte 5 runes, we can export signals directly.
// We'll use a writable store for compatibility with older patterns if needed,
// but prefer direct signal usage in Svelte 5 components.

/**
 * The currently selected file to be displayed in the editor.
 * It's a `PageHeader` object which contains the title and path.
 */
export const currentFile: Writable<PageHeader | null> = writable(null);

/**
 * The raw Markdown content of the currently opened file.
 */
export const editorContent: Writable<string> = writable('');

/**
 * The file tree structure of the vault.
 */
export const fileTree: Writable<FileNode | null> = writable(null);

/**
 * A map of all tags and the pages they are on.
 */
export const tags: Writable<[string, string[]][]> = writable([]);
