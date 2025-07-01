<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import { invoke } from '@tauri-apps/api/core';
	import type { PageHeader } from '$lib/bindings';
	import { onDestroy } from 'svelte';
	import { fileViewMode } from '$lib/stores';

	// This component receives the file to display as a prop.
	let { file } = $props<{ file: PageHeader }>();
	let pageContent = $state<string | undefined>(undefined);
	let pristineContent = $state<string | undefined>(undefined);
	let saveTimeout: number;

	// This effect handles loading the file content whenever the 'file' prop changes.
	$effect(() => {
		// Reset page content when a new file is loaded.
		pageContent = undefined;
		pristineContent = undefined;

		invoke<string>('get_page_content', { path: file.path })
			.then((content) => {
				pageContent = content;
				pristineContent = content;
			})
			.catch((e) => {
				console.error('Failed to get page content:', e);
				const errorContent = `# Error\n\nCould not load file: ${file.path}`;
				pageContent = errorContent;
				pristineContent = errorContent;
			});
	});

	// This effect handles debounced auto-saving when the content changes.
	$effect(() => {
		if (pageContent === undefined || pageContent === pristineContent) {
			return;
		}

		clearTimeout(saveTimeout);
		const path = file.path;
		const contentToSave = pageContent;

		saveTimeout = window.setTimeout(() => {
			invoke('write_page_content', { path, content: contentToSave })
				.then(() => {
					pristineContent = contentToSave;
					console.log(`Saved changes to ${path}`);
				})
				.catch((e) => console.error('Failed to save content:', e));
		}, 500);
	});

	// Ensure the timeout is cleared if the component is destroyed.
	onDestroy(() => {
		clearTimeout(saveTimeout);
	});
</script>

<!-- The markup reads from and writes to the global $fileViewMode store -->
{#if $fileViewMode === 'split'}
	<!-- Split View: Editor + Preview -->
	<div class="editor-pane">
		{#if pageContent !== undefined}
			<Editor bind:content={pageContent} title={file.title} />
		{/if}
	</div>
	<div class="preview-pane">
		<button class="mode-toggle-btn" onclick={() => ($fileViewMode = 'preview')}>
			📖 Preview Only
		</button>
		<Preview content={pageContent} />
	</div>
{:else}
	<!-- Preview-Only View -->
	<div class="preview-pane full-width">
		<button class="mode-toggle-btn" onclick={() => ($fileViewMode = 'split')}> ✏️ Edit </button>
		<Preview content={pageContent} />
	</div>
{/if}

<style>
	.editor-pane,
	.preview-pane {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		height: 100%;
		box-sizing: border-box;
		position: relative; /* For the button */
	}

	.editor-pane {
		border-right: 1px solid var(--border-color);
	}

	.preview-pane.full-width {
		flex-basis: 100%;
	}

	.mode-toggle-btn {
		position: absolute;
		top: 1rem;
		right: 2rem;
		z-index: 10;
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

	.mode-toggle-btn:hover {
		background-color: var(--ink);
	}
</style>
