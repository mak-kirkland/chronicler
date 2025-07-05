<script lang="ts">
	import Infobox from './Infobox.svelte';
	import { currentView } from '$lib/stores';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { resolve, dirname } from '@tauri-apps/api/path';
	import type { PageHeader, RenderedPage } from '$lib/bindings';

	let { renderedData } = $props<{ renderedData: RenderedPage | null }>();
	let imageUrl = $state<string | null>(null);

	function handleLinkClick(event: Event) {
		// For keyboard events, only activate the link on "Enter" or "Space"
		if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') {
			return; // Do nothing, allowing default behavior (like tabbing)
		}

		const target = event.target as HTMLElement;
		const link = target.closest('a.internal-link');

		if (link && link.hasAttribute('data-path')) {
			event.preventDefault();
			const path = link.getAttribute('data-path')!;
			const targetPage: PageHeader = {
				path: path,
				title: link.textContent || 'Unknown Page'
			};
			currentView.set({ type: 'file', data: targetPage });
		}
	}

	$effect(() => {
		(async () => {
			if (!renderedData?.infobox_image_path || $currentView.type !== 'file' || !$currentView.data?.path) {
				imageUrl = null;
				return;
			}
			try {
				const dir = await dirname($currentView.data.path);
				const imagePath = await resolve(dir, renderedData.infobox_image_path);
				imageUrl = convertFileSrc(imagePath);
			} catch (e) {
				console.error('Image Path Error:', e);
				imageUrl = null;
			}
		})();
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div
	class="preview-wrapper"
	onclick={handleLinkClick}
	onkeydown={handleLinkClick}
	role="document"
	tabindex="0"
>
	{#if renderedData}
		<Infobox data={renderedData.processed_frontmatter} {imageUrl} />
		<div class="preview-content">
			{@html renderedData.rendered_html}
		</div>
	{/if}
</div>

<style>
	.preview-wrapper {
		height: 100%;
	}
	.preview-content {
		flex-grow: 1;
		overflow-y: auto;
		line-height: 1.7;
	}
	.preview-content :global(h1),
	.preview-content :global(h2),
	.preview-content :global(h3) {
		font-family: 'Uncial Antiqua', cursive;
		color: var(--ink-light);
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 0.3em;
		margin-top: 1.5em;
		margin-bottom: 0.3em;
	}
	.preview-content :global(h1 + p),
	.preview-content :global(h2 + p),
	.preview-content :global(h3 + p) {
		margin-top: 0;
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
