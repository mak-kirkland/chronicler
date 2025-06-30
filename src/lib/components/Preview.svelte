<script lang="ts">
    import Infobox from './Infobox.svelte';
    import { currentFile } from '$lib/stores';
    import { convertFileSrc } from '@tauri-apps/api/core';
    import { resolve, dirname } from '@tauri-apps/api/path';
    import { invoke } from '@tauri-apps/api/core';
    import type { PageHeader, RenderedPage } from '$lib/bindings';

    let { content } = $props<{ content: string | undefined }>();

    let frontmatter = $state<any>(null);
    let renderedHtml = $state('');
    let imageUrl = $state<string | null>(null);

    // This function handles clicks on the rendered content to navigate to linked pages.
    function handleLinkClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const link = target.closest('a.internal-link');

        if (link && link.hasAttribute('data-path')) {
            event.preventDefault(); // Stop the browser from following the '#' href
            const path = link.getAttribute('data-path')!;
            const targetPage: PageHeader = {
                path: path,
                title: link.textContent || 'Unknown Page'
            };
            currentFile.set(targetPage);
        }
    }

    $effect(() => {
        (async () => {
            if (content === undefined || content === null) {
                frontmatter = null;
                renderedHtml = '';
                imageUrl = null;
                return;
            }

            try {
                // 1. Call the Rust command to get the fully processed page data.
                const pageData = await invoke<RenderedPage>('get_rendered_page', { content });

                // 2. Set the processed data from the backend.
                frontmatter = pageData.processed_frontmatter;
                renderedHtml = pageData.rendered_html;

                // 3. Handle the infobox image path using the field from the backend.
                let imgUrl: string | null = null;
                if (pageData.infobox_image_path && $currentFile?.path) {
                    try {
                        const dir = await dirname($currentFile.path);
                        const imagePath = await resolve(dir, pageData.infobox_image_path);
                        imgUrl = convertFileSrc(imagePath);
                    } catch (e) {
                        console.error("Image Path Error:", e);
                    }
                }
                imageUrl = imgUrl;

            } catch (e) {
                console.error("Failed to render page:", e);
                renderedHtml = `<div class="error-box">Error rendering page: ${e}</div>`;
                frontmatter = null;
                imageUrl = null;
            }
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

    .preview-wrapper :global(a.internal-link) {
        color: #2563eb;
        text-decoration: none;
        border-bottom: 1px dotted #2563eb;
        cursor: pointer;
    }

    .preview-wrapper :global(span.internal-link.broken) {
        color: #b04a4a;
        text-decoration: none;
        border-bottom: 1px dotted #b04a4a;
        cursor: help;
    }

    .error-box {
        background-color: rgba(139, 0, 0, 0.1);
        color: darkred;
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
        font-size: 0.85rem;
        border: 1px solid rgba(139, 0, 0, 0.2);
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
