// Wikilink processing utilities
import { resolveWikilink } from "$lib/utils/tauri";

// Process wikilinks in markdown content
export function processWikilinks(content: string): string {
    // Convert [[wikilinks]] to clickable elements
    return content.replace(/\[\[([^\]]+)\]\]/g, (_, link) => {
        return `<a href="wiki://${link}" class="wikilink">${link}</a>`;
    });
}

// Handle wikilink clicks
export function handleWikilinkClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (target.tagName === 'A' && target.classList.contains('wikilink')) {
        event.preventDefault();
        const href = target.getAttribute('href');

        if (href && href.startsWith('wiki://')) {
            const link = href.slice(7);
            openWikilink(link);
        }
    }
}

// Open a wikilink
async function openWikilink(link: string) {
    try {
        // Resolve link using Rust backend
        const resolvedPath = await resolveWikilink(currentPath, link);

        // Open the resolved file in the editor
        // (Implementation depends on your state management)
        console.log(`Opening resolved wikilink: ${resolvedPath}`);
    } catch (err) {
        console.error(`Failed to resolve wikilink: ${err}`);
    }
}
