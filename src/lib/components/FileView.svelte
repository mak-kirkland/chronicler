<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import { invoke } from '@tauri-apps/api/core';
	import type { PageHeader, FullPageData, RenderedPage, FileNode } from '$lib/bindings';
	import { onDestroy } from 'svelte';
	import { fileViewMode, currentView, isRightSidebarVisible, activeBacklinks, fileTree } from '$lib/stores';

	let { file } = $props<{ file: PageHeader }>();

	let pageData = $state<FullPageData | null>(null);
	let pristineContent = $state<string | undefined>(undefined);
	let saveTimeout: number;

	// Helper function to check if a file path exists in the file tree.
	function findFileInTree(node: FileNode | null, path: string): boolean {
		if (!node) return false;
		if (node.path === path) return true;
		if (node.children) {
			// Use a for...of loop for better performance and readability
			for (const child of node.children) {
				if (findFileInTree(child, path)) {
					return true;
				}
			}
		}
		return false;
	}

	// This effect fetches the page data whenever the file prop changes.
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
					return invoke<RenderedPage>('render_page_preview', { content: contentToSave });
				})
				.then((newlyRenderedData) => {
					if (pageData) {
						pageData.rendered_page = newlyRenderedData;
					}
				})
				.catch((e) => console.error('Failed to save or re-render content:', e));
		}, 500);
	});

	// This reactive effect runs whenever the fileTree store changes.
	// It checks if the current file has been deleted/renamed and closes the view if so.
	$effect(() => {
		// Create a dependency on the $fileTree store.
		const tree = $fileTree;
		if (tree && !findFileInTree(tree, file.path)) {
			console.log(
				`Current file ${file.path} not found in tree after update. Closing view.`
			);
			currentView.set({ type: 'welcome' });
		}
	});

	onDestroy(() => {
		clearTimeout(saveTimeout);
	});
</script>

<div class="file-view-container">
	{#if pageData}
		<!-- A single header for all modes, positioned absolutely -->
		<div class="view-header">
			<h2 class="view-title" title={file.title.replace('.md', '')}>
				{file.title.replace('.md', '')}
			</h2>

			<div class="view-actions">
				{#if $activeBacklinks.length > 0}
					<button
						class="pane-header-btn"
						onclick={() => isRightSidebarVisible.set(!$isRightSidebarVisible)}
						title="Toggle Backlinks"
					>
						🔗 {$activeBacklinks.length}
					</button>
				{/if}

				{#if $fileViewMode === 'split'}
					<button class="mode-toggle-btn" onclick={() => ($fileViewMode = 'preview')}>
						📖 Preview Only
					</button>
				{:else}
					<button class="mode-toggle-btn" onclick={() => ($fileViewMode = 'split')}>
						✏️ Edit
					</button>
				{/if}
			</div>
		</div>

		<!-- Content panes below the header -->
		<div class="content-panes">
			{#if $fileViewMode === 'split'}
				<div class="editor-pane">
					<Editor bind:content={pageData.raw_content} />
				</div>
				<div class="preview-pane">
					<Preview renderedData={pageData.rendered_page} />
				</div>
			{:else}
				<div class="preview-pane full-width">
					<Preview renderedData={pageData.rendered_page} />
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.file-view-container {
		position: relative; /* Needed for absolute positioning of the header */
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
	}

	.view-header {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 2rem;
		background-color: rgba(253, 246, 227, 0.85); /* Semi-transparent parchment */
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border-bottom: 1px solid var(--border-color);
		z-index: 20; /* Ensure it's above content */
		height: 60px; /* Give it a fixed height */
		box-sizing: border-box;
	}

	.view-title {
		font-family: 'Uncial Antiqua', cursive;
		color: var(--ink-light);
		margin: 0;
		font-size: 1.5rem;
		flex-shrink: 1;
		flex-grow: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-right: 1rem;
	}

	.view-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.content-panes {
		display: flex;
		flex-grow: 1;
		padding-top: 60px; /* Match header height */
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
	}

	.editor-pane,
	.preview-pane {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		height: 100%;
		box-sizing: border-box;
	}

	.editor-pane {
		border-right: 1px solid var(--border-color);
	}

	.preview-pane.full-width {
		flex-basis: 100%;
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
