// Wikilink processing utilities

import { resolveWikilink } from './tauri';
import { appState } from '../state/appState.svelte';

/**
 * Process wikilinks in HTML content
 * Converts [[wikilinks]] to clickable elements
 */
export function processWikilinks(htmlContent: string): string {
    // Convert wiki:// links (from markdown processing) to clickable elements
    return htmlContent.replace(
        /href="wiki:\/\/([^"]+)"/g,
        'href="#" data-wikilink="$1" class="wikilink"'
    );
}

/**
 * Handle wikilink clicks
 */
export async function handleWikilinkClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (target.tagName === 'A' && target.hasAttribute('data-wikilink')) {
        event.preventDefault();
        const link = target.getAttribute('data-wikilink');

        if (link) {
            await openWikilink(link);
        }
    }
}

/**
 * Open a wikilink by resolving it and loading the file
 */
async function openWikilink(link: string) {
    try {
        // Get current file path from app state
        const currentPath = appState.activePath || '';

        // Resolve link using Rust backend
        const resolvedPath = await resolveWikilink(currentPath, link);

        // Load the resolved file
        await appState.loadFile(resolvedPath);

        console.log(`Opened wikilink: ${link} -> ${resolvedPath}`);
    } catch (error) {
        console.error(`Failed to open wikilink "${link}":`, error);
        // You could show a toast notification here
        alert(`Could not open "${link}": ${error}`);
    }
}
