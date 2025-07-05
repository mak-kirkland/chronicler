import { currentView, appStatus } from '$lib/stores';
import type { PageHeader, TagMap } from '$lib/bindings';
import type { ViewState } from '$lib/stores';
import { initializeVault as invokeInitializeVault } from './commands';
import { getTitleFromPath } from './utils';

/**
 * Navigates to the tag index view for the selected tag.
 * This is a centralized action to ensure consistent navigation behavior
 * from anywhere in the app.
 *
 * @param tagName The name of the tag to navigate to.
 * @param allTags The complete map of all tags and their associated page paths.
 */
export function navigateToTag(tagName: string, allTags: TagMap) {
	const tagData = allTags.find(([name]) => name === tagName);

	if (!tagData) {
		console.warn(`No data found for tag: ${tagName}`);
		return;
	}

	const pagePaths = tagData[1];

	const pages: PageHeader[] = pagePaths.map((path) => ({
		path,
		title: getTitleFromPath(path)
	}));

	const newView: ViewState = {
		type: 'tag',
		data: {
			name: tagName,
			pages: pages
		}
	};

	currentView.set(newView);
}

/**
 * Initializes the vault at the given path.
 * This sets the app status, calls the backend, and handles success/error states.
 * On failure, it throws an error to be caught by the calling component.
 * @param path The absolute path to the vault folder.
 */
export async function initializeVault(path: string) {
	appStatus.set('loading');
	try {
		await invokeInitializeVault(path);
		appStatus.set('ready');
	} catch (e) {
		console.error(`Failed to initialize vault at ${path}:`, e);
		// Re-throw the error so the calling component can handle it (e.g., display a message)
		throw new Error(`Could not open vault at "${path}". Please ensure it is a valid directory. Error: ${e}`);
	}
}
