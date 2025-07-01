import { currentView, tags } from '$lib/stores';
import type { PageHeader, TagMap } from '$lib/bindings';
import type { ViewState } from '$lib/stores';

/**
 * Navigates to the tag index view for the selected tag.
 * This is a centralized action to ensure consistent navigation behavior
 * from anywhere in the app. It takes the tag name and the full tag map
 * (which components can get reactively from the `$tags` store).
 *
 * @param tagName The name of the tag to navigate to.
 * @param allTags The complete map of all tags and their associated page paths.
 */
export function navigateToTag(tagName:string, allTags: TagMap) {
	const tagData = allTags.find(([name]) => name === tagName);

	if (!tagData) {
		console.warn(`No data found for tag: ${tagName}`);
		return;
	}

	const pagePaths = tagData[1];

	// Create PageHeader objects from the paths for the view
	const pages: PageHeader[] = pagePaths.map((path) => ({
		path,
		title: path.split(/[\\/]/).pop() || 'Untitled'
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
