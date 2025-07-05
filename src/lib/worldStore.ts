import { writable, derived } from 'svelte/store';
import { listen } from '@tauri-apps/api/event';
import { getFileTree, getAllTags } from './commands';
import type { FileNode, TagMap } from './bindings';

/**
 * The shape of the core application data.
 */
export interface WorldState {
	files: FileNode | null;
	tags: TagMap;
	isLoaded: boolean;
	error: string | null;
}

const initialState: WorldState = {
	files: null,
	tags: [],
	isLoaded: false,
	error: null
};

/**
 * A factory function to create a managed store for the application's "world" data.
 * This encapsulates asynchronous loading, error handling, and real-time updates.
 */
function createWorldStore() {
	const { subscribe, set, update } = writable<WorldState>(initialState);
	let unlisten: (() => void) | null = null;

	/**
	 * Fetches all necessary data from the backend and updates the store state.
	 */
	const loadData = async () => {
		try {
			const [files, tags] = await Promise.all([getFileTree(), getAllTags()]);
			update((s) => ({ ...s, files, tags, isLoaded: true, error: null }));
		} catch (e: any) {
			console.error('Failed to load world data:', e);
			update((s) => ({ ...s, isLoaded: false, error: `Failed to load world data: ${e.message}` }));
		}
	};

	return {
		subscribe, // so components can subscribe to the store via $
		/**
		 * Initializes the store by loading data for the first time and setting up
		 * the real-time event listener for backend updates.
		 */
		initialize: async () => {
			// Ensure we don't set up multiple listeners
			if (unlisten) {
				unlisten();
				unlisten = null;
			}

			await loadData();

			unlisten = await listen('index-updated', () => {
				console.log('Index update received from backend, refreshing world data...');
				loadData();
			});
		},
		/**
		 * Resets the store to its initial state and cleans up any active listeners.
		 * This should be called when the user changes or closes the vault.
		 */
		destroy: () => {
			if (unlisten) {
				unlisten();
				unlisten = null;
			}
			set(initialState);
		}
	};
}

/**
 * The main, managed store for all core world data.
 * It is exported here so that the root layout component can call its
 * initialize() and destroy() methods. Other components should not import this directly.
 */
export const world = createWorldStore();

// --- Derived Stores ---
// Components should import these directly to make their data dependencies explicit.

/**
 * A derived store that only contains the file tree.
 */
export const files = derived(world, ($world) => $world.files);

/**
 * A derived store that only contains the tag map.
 */
export const tags = derived(world, ($world) => $world.tags);

/**
 * A derived store that reflects the loading status of the world data.
 */
export const isWorldLoaded = derived(world, ($world) => $world.isLoaded);
