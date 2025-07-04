import { writable, type Writable } from 'svelte/store';
import type { FileNode, PageHeader, TagMap } from './bindings';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
export const fileTree = writable<FileNode | null>(null);

/**
 * A list of all tags and the pages they appear on.
 */
export const tags = writable<TagMap>([]);

let sidebarInitialized = false;
let unlisten: (() => void) | null = null;

async function loadSidebarData() {
	try {
		const [tree, sortedTags] = await Promise.all([
			invoke<FileNode>('get_file_tree'),
			invoke<TagMap>('get_all_tags')
		]);
		fileTree.set(tree);
		tags.set(sortedTags);
	} catch (e) {
		console.error('Failed to load sidebar data:', e);
	}
}

export async function initializeSidebar() {
	if (sidebarInitialized) return;
	sidebarInitialized = true;

	await loadSidebarData();

	unlisten = await listen('index-updated', () => {
		console.log('Index update received from backend, refreshing sidebar data...');
		loadSidebarData();
	});
}

/**
 * This store manages the view mode (split or preview) for files.
 */
export const fileViewMode: Writable<'preview' | 'split'> = writable('preview');

// --- Store for the Right Sidebar ---
interface RightSidebarState {
	isVisible: boolean;
	backlinks: PageHeader[];
}

const initialRightSidebarState: RightSidebarState = {
	isVisible: false,
	backlinks: []
};

/**
 * Manages the state of the right-hand metadata panel (for backlinks, etc.).
 */
export const rightSidebar = writable<RightSidebarState>(initialRightSidebarState);

/**
 * Resets all data stores to their initial state.
 * This is useful when changing vaults.
 */
export function resetAllStores() {
	currentView.set({ type: 'welcome' });
	fileTree.set(null);
	tags.set([]);
	fileViewMode.set('preview');
	rightSidebar.set(initialRightSidebarState);
	sidebarInitialized = false;
	if (unlisten) {
		unlisten();
		unlisten = null;
	}
}
