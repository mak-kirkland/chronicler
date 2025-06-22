<script lang="ts">
    import { marked } from 'marked';
    import * as yaml from 'js-yaml';
    import Infobox from './Infobox.svelte';
    import { currentFile } from '$lib/stores';
    import { convertFileSrc } from '@tauri-apps/api/core';
    import { resolve, dirname } from '@tauri-apps/api/path';
    import { invoke } from '@tauri-apps/api/core';
    import type { PageHeader } from '$lib/bindings';

    let { content } = $props<{ content: string | undefined }>();

    let frontmatter = $state<any>(null);
    let renderedHtml = $state('');
    let imageUrl = $state<string | null>(null);

    // State to hold all pages for link validation
    let allPages = $state<PageHeader[]>([]);
    let pageMap = $state<Map<string, PageHeader>>(new Map());

    // This helper function replaces wikilinks with valid <a> tags or styled <span> tags for broken links.
    function replaceWikilinks(text: string): string {
        if (!text || pageMap.size === 0) return text;

        const wikilinkRegex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
        return text.replace(wikilinkRegex, (match, target, alias) => {
            const linkTarget = target.trim();
            const linkText = alias ? alias.trim() : linkTarget;
            // Normalize the link target to match the keys in our pageMap (lowercase)
            const normalizedTarget = linkTarget.toLowerCase();

            const page = pageMap.get(normalizedTarget);

            if (page) {
                // This is a valid link. Create a real <a> tag with a data attribute.
                return `<a href="#" class="internal-link" data-path="${page.path}">${linkText}</a>`;
            } else {
                // This is a broken link. Create a styled span.
                return `<span class="internal-link broken">${linkText}</span>`;
            }
        });
    }

    // This function handles clicks on the rendered content to navigate to linked pages.
    function handleLinkClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const link = target.closest('a.internal-link');

        if (link && link.hasAttribute('data-path')) {
            event.preventDefault(); // Stop the browser from following the '#' href
            const path = link.getAttribute('data-path')!;
            const targetPage = allPages.find(p => p.path === path);
            if (targetPage) {
                // Set the global currentFile store to navigate the app
                currentFile.set(targetPage);
            }
        }
    }

    $effect(() => {
        (async () => {
            // 1. Fetch all pages once to create a lookup map for link validation.
            if (allPages.length === 0) {
                try {
                    const pages = await invoke<PageHeader[]>('get_all_pages');
                    allPages = pages;
                    const newMap = new Map<string, PageHeader>();
                    for (const page of pages) {
                        // The key is the lowercase filename without extension, e.g., "charles the turner"
                        const key = page.path.split(/[\\/]/).pop()!.replace(/\.md$/, '').toLowerCase();
                        newMap.set(key, page);
                    }
                    pageMap = newMap;
                } catch (e) {
                    console.error("Failed to fetch page list:", e);
                }
            }

            if (content === undefined || content === null) {
                frontmatter = null;
                renderedHtml = '';
                imageUrl = null;
                return;
            }

            let body = content;
            let fm: any = null;
            let imgUrl: string | null = null;

            // 2. Extract and parse frontmatter.
            if (content.trim().startsWith('---')) {
                const endOfFrontmatter = content.indexOf('---', 3);
                if (endOfFrontmatter !== -1) {
                    const frontmatterStr = content.substring(3, endOfFrontmatter);
                    const sanitizedFrontmatterStr = frontmatterStr.replace(/\u00A0/g, ' ');

                    try {
                        fm = yaml.load(sanitizedFrontmatterStr);
                    } catch (e) {
                        console.error('YAML Parse Error:', e);
                        fm = { error: 'Invalid YAML', details: e.message };
                    }
                    body = content.substring(endOfFrontmatter + 3);
                }
            }

            // 3. Resolve infobox image path.
            if (fm?.image && $currentFile?.path) {
                try {
                    const dir = await dirname($currentFile.path);
                    const imagePath = await resolve(dir, fm.image);
                    imgUrl = convertFileSrc(imagePath);
                } catch (e) {
                    console.error("Image Path Error:", e);
                    imgUrl = null;
                }
            }

            // 4. Process wikilinks in the frontmatter before passing to the Infobox component.
            if (fm) {
                // Create a deep copy to avoid modifying the original parsed data.
                const processedFm = JSON.parse(JSON.stringify(fm));
                for (const key in processedFm) {
                    const value = processedFm[key];
                    if (typeof value === 'string') {
                        processedFm[key] = replaceWikilinks(value);
                    } else if (Array.isArray(value)) {
                        processedFm[key] = value.map(item => (typeof item === 'string' ? replaceWikilinks(item) : item));
                    }
                }
                frontmatter = processedFm;
            } else {
                frontmatter = null;
            }

            // 5. Process wikilinks in the body and render the final HTML.
            const processedBody = replaceWikilinks(body ?? '');
            // **THE FIX:** Added `await` to correctly handle the async function.
            renderedHtml = await marked.parse(processedBody, { breaks: true });
            imageUrl = imgUrl;
        })();
    });
</script>

<div class="preview-wrapper" onclick={handleLinkClick}>
    <h2>Preview</h2>

    {#if frontmatter && typeof frontmatter === 'object'}
        <Infobox data={frontmatter} {imageUrl} />
    {/if}
    <div class="preview-content">
        {@html renderedHtml}
    </div>
</div>

<style>
    .preview-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
    }
    h2 {
        font-family: 'Uncial Antiqua', cursive;
        color: var(--ink-light);
        margin-top: 0;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
    }
    .preview-content {
        flex-grow: 1;
        overflow-y: auto;
        line-height: 1.7;
        white-space: pre-wrap;
    }

    .preview-content :global(h1),
    .preview-content :global(h2),
    .preview-content :global(h3) {
        font-family: 'Uncial Antiqua', cursive;
        color: var(--ink-light);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.3em;
    }

    /* Updated to style both valid and broken links */
    .preview-wrapper :global(a.internal-link) {
        color: #2563eb; /* Changed to blue for working links */
        text-decoration: none;
        border-bottom: 1px dotted #2563eb;
        cursor: pointer;
    }

    .preview-wrapper :global(span.internal-link.broken) {
        color: #b04a4a; /* A slightly softer red for broken links */
        text-decoration: none;
        border-bottom: 1px dotted #b04a4a;
        cursor: help; /* Indicate that the link is broken */
    }

    .preview-content :global(blockquote) {
        border-left: 3px solid var(--border-color);
        padding-left: 1em;
        margin-left: 0;
        font-style: italic;
        color: var(--ink-light);
    }

    .preview-content :global(code) {
        background-color: rgba(0, 0, 0, 0.05);
        padding: 0.2em 0.4em;
        border-radius: 3px;
    }

    .preview-content :global(pre) {
        background-color: rgba(0, 0, 0, 0.05);
        padding: 1em;
        border-radius: 4px;
        overflow-x: auto;
    }
</style>
