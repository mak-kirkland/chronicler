<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import Button from '$lib/components/Button.svelte';
	import ErrorBox from '$lib/components/ErrorBox.svelte';
	import { onDestroy } from 'svelte';
	import { fileViewMode, currentView, rightSidebar } from '$lib/stores';
	import { files, isWorldLoaded } from '$lib/worldStore';
	import { buildPageView, writePageContent, renderPagePreview } from '$lib/commands';
	import type { PageHeader, FullPageData, RenderedPage } from '$lib/bindings';
	import { findFileInTree } from '$lib/utils';

	let { file } = $props<{ file: PageHeader }>();

	let pageData = $state<FullPageData | null>(null);
	let error = $state<string | null>(null);
	let pristineContent = $state<string | undefined>(undefined);
	let saveTimeout: number;

	$effect(() => {
		pageData = null;
		error = null;
		pristineContent = undefined;
		// Reset backlinks when navigating to a new file
		rightSidebar.update((state) => ({ ...state, backlinks: [] }));

		buildPageView(file.path)
			.then((data) => {
				pageData = data;
				pristineContent = data.raw_content;
				// Update the backlinks in the store
				rightSidebar.update((state) => ({ ...state, backlinks: data.backlinks }));
			})
			.catch((e) => {
				console.error('Failed to get page data:', e);
				error = `Could not load file: ${e}`;
			});
	});

	$effect(() => {
		if (!pageData || pageData.raw_content === pristineContent) {
			return;
		}

		clearTimeout(saveTimeout);
		const path = file.path;
		const contentToSave = pageData.raw_content;

		saveTimeout = window.setTimeout(() => {
			writePageContent(path, contentToSave)
				.then(() => {
					pristineContent = contentToSave;
					return renderPagePreview(contentToSave);
				})
				.then((newlyRenderedData) => {
					if (pageData) {
						pageData.rendered_page = newlyRenderedData;
					}
				})
				.catch((e) => console.error('Failed to save or re-render content:', e));
		}, 500);
	});

	$effect(() => {
		// If the file is deleted or renamed, it will no longer be in the tree.
		// In that case, navigate back to the welcome screen.
		const tree = $files;
		if ($isWorldLoaded && tree && !findFileInTree(tree, file.path)) {
			console.log(`Current file ${file.path} not found in tree after update. Closing view.`);
			currentView.set({ type: 'welcome' });
		}
	});

	onDestroy(() => {
		clearTimeout(saveTimeout);
	});
</script>

<div class="file-view-container">
	{#if error}
		<div class="error-container">
			<ErrorBox title="File Error">{error}</ErrorBox>
		</div>
	{:else if pageData}
		<div class="view-header">
			<h2 class="view-title" title={file.title}>
				{file.title}
			</h2>

			<div class="view-actions">
				{#if $rightSidebar.backlinks.length > 0}
					<Button
						size="small"
						onclick={() => rightSidebar.update((state) => ({ ...state, isVisible: !state.isVisible }))}
						title="Toggle Backlinks"
					>
						🔗 {$rightSidebar.backlinks.length}
					</Button>
				{/if}

				{#if $fileViewMode === 'split'}
					<Button size="small" onclick={() => ($fileViewMode = 'preview')}>
						📖 Preview Only
					</Button>
				{:else}
					<Button size="small" onclick={() => ($fileViewMode = 'split')}>
						✏️ Edit
					</Button>
				{/if}
			</div>
		</div>

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
		position: relative;
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
		background-color: rgba(253, 246, 227, 0.85);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border-bottom: 1px solid var(--border-color);
		z-index: 20;
		height: 60px;
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
		padding-top: 60px;
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

	.error-container {
		padding: 2rem;
		width: 100%;
	}
</style>
