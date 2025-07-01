import type { FileNode, PageHeader } from './bindings';
import { writable, type Writable } from 'svelte/store';

/**
 * A type for the data needed to render the tag index page.
 */
export type TagIndexData = {
	name: string;
	pages: PageHeader[];
};

/**
 * A union type to represent the possible states of the main view.
 */
export type ViewState =
	| { type: 'welcome' }
	| { type: 'tag'; data: TagIndexData }
	| { type: 'file'; data: PageHeader | null };

/**
 * This store manages what is currently displayed in the main content area.
 * It defaults to the 'welcome' screen.
 */
export const currentView: Writable<ViewState> = writable({ type: 'welcome' });

/**
 * The file tree structure of the vault.
 */
export const fileTree: Writable<FileNode | null> = writable(null);

/**
 * A list of all tags and the pages they appear on.
 */
export const tags: Writable<[string, string[]][]> = writable([]);

/**
 * This store manages the view mode (split or preview) for files.
 * It's global so the mode can persist when navigating between files.
 */
export const fileViewMode: Writable<'preview' | 'split'> = writable('preview');
