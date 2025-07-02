import type { FileNode, PageHeader } from './bindings';
import { writable, type Writable } from 'svelte/store';

/**
 * Represents the overall status of the application, determining which main view to show.
 */
export type AppStatus = 'selecting_vault' | 'loading' | 'ready' | 'error';

/**
 * Manages the application's current status.
 */
export const appStatus = writable<AppStatus>('selecting_vault');

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
 */
export const fileViewMode: Writable<'preview' | 'split'> = writable('preview');

// Stores for the right-hand metadata panel (for backlinks, etc.)
export const isRightSidebarVisible = writable(false);
export const activeBacklinks = writable<PageHeader[]>([]);

/**
 * Resets all data stores to their initial state.
 * This is useful when changing vaults.
 */
export function resetAllStores() {
	currentView.set({ type: 'welcome' });
	fileTree.set(null);
	tags.set([]);
	fileViewMode.set('preview');
	isRightSidebarVisible.set(false);
	activeBacklinks.set([]);
}
