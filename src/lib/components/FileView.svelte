<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import { invoke } from '@tauri-apps/api/core';
	import type { PageHeader, FullPageData, RenderedPage } from '$lib/bindings';
	import { onDestroy } from 'svelte';
	import { fileViewMode, currentView, isRightSidebarVisible, activeBacklinks } from '$lib/stores';
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';

	let { file } = $props<{ file: PageHeader }>();

	let pageData = $state<FullPageData | null>(null);
	let pristineContent = $state<string | undefined>(undefined);
	let saveTimeout: number;

	$effect(() => {
		// Reset state for the new file
		pageData = null;
		pristineContent = undefined;
		activeBacklinks.set([]); // Clear backlinks for the new page

		invoke<FullPageData>('get_page_data_for_view', { path: file.path })
			.then((data) => {
				pageData = data;
				pristineContent = data.raw_content;
				activeBacklinks.set(data.backlinks); // Set backlinks for the new page
			})
			.catch((e) => {
				console.error('Failed to get page data:', e);
				const errorHtml = `<div class="error-box">Error loading page: ${e}</div>`;
				pageData = {
					raw_content: `# Error\n\nCould not load file: ${file.path}`,
					rendered_page: {
						processed_frontmatter: null,
						rendered_html: errorHtml,
						infobox_image_path: undefined
					},
					backlinks: []
				};
				pristineContent = pageData.raw_content;
			});
	});

	// The autosave effect re-renders the preview after a successful save.
	$effect(() => {
		if (!pageData || pageData.raw_content === pristineContent) {
			return;
		}

		clearTimeout(saveTimeout);
		const path = file.path;
		const contentToSave = pageData.raw_content;

		saveTimeout = window.setTimeout(() => {
			invoke('write_page_content', { path, content: contentToSave })
				.then(() => {
					pristineContent = contentToSave;
					// After saving, re-render the content to update the preview.
					// We only need the rendered part, not the full page data again.
					return invoke<RenderedPage>('get_rendered_page', { content: contentToSave });
				})
				.then((newlyRenderedData) => {
					if (pageData) {
						pageData.rendered_page = newlyRenderedData;
					}
				})
				.catch((e) => console.error('Failed to save or re-render content:', e));
		}, 500);
	});

	onMount(() => {
		const unlistenPromise = listen('index-updated', async () => {
			try {
				const allPaths = await invoke<string[]>('get_all_page_paths');
				if (!allPaths.includes(file.path)) {
					currentView.set({ type: 'welcome' });
				}
			} catch (e) {
				console.error('Failed to check for deleted file:', e);
			}
		});

		return () => {
			unlistenPromise.then((unlistenFn) => unlistenFn());
		};
	});

	onDestroy(() => {
		clearTimeout(saveTimeout);
	});
</script>

{#if pageData}
	{#if $fileViewMode === 'split'}
		<div class="editor-pane">
			<Editor bind:content={pageData.raw_content} title={file.title} />
		</div>
		<div class="preview-pane">
			<div class="pane-header">
				{#if $activeBacklinks.length > 0}
					<button
						class="pane-header-btn"
						onclick={() => isRightSidebarVisible.set(!$isRightSidebarVisible)}
						title="Toggle Backlinks"
					>
						🔗 {$activeBacklinks.length}
					</button>
				{/if}
				<button class="mode-toggle-btn" onclick={() => ($fileViewMode = 'preview')}>
					📖 Preview Only
				</button>
			</div>
			<Preview renderedData={pageData.rendered_page} />
		</div>
	{:else}
		<div class="preview-pane full-width">
			<div class="pane-header">
				{#if $activeBacklinks.length > 0}
					<button
						class="pane-header-btn"
						onclick={() => isRightSidebarVisible.set(!$isRightSidebarVisible)}
						title="Toggle Backlinks"
					>
						🔗 {$activeBacklinks.length}
					</button>
				{/if}
				<button class="mode-toggle-btn" onclick={() => ($fileViewMode = 'split')}>
					✏️ Edit
				</button>
			</div>
			<Preview renderedData={pageData.rendered_page} />
		</div>
	{/if}
{/if}

<style>
	.editor-pane,
	.preview-pane {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		padding-top: 4rem; /* Add space for the header */
		height: 100%;
		box-sizing: border-box;
		position: relative;
	}
	.editor-pane {
		border-right: 1px solid var(--border-color);
	}
	.preview-pane.full-width {
		flex-basis: 100%;
	}
	.pane-header {
		position: absolute;
		top: 1rem;
		right: 2rem;
		display: flex;
		gap: 0.5rem;
		z-index: 10;
	}
	.mode-toggle-btn,
	.pane-header-btn {
		padding: 0.5rem 1rem;
		background-color: rgba(74, 63, 53, 0.8);
		color: var(--parchment);
		border: 1px solid rgba(211, 199, 179, 0.5);
		border-radius: 6px;
		cursor: pointer;
		font-family: 'IM Fell English', serif;
		font-size: 0.9rem;
		transition: background-color 0.2s;
	}
	.mode-toggle-btn:hover,
	.pane-header-btn:hover {
		background-color: var(--ink);
	}
</style>
