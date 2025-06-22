<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import { currentFile } from '$lib/stores';
	import { invoke } from '@tauri-apps/api/core';
	import { onDestroy } from 'svelte';

	let sidebarWidth = $state(300);
	let isResizing = $state(false);

	let pageContent = $state<string | undefined>(undefined);
	let pristineContent = $state<string | undefined>(undefined);
	let saveTimeout: number;

	// This effect handles LOADING a new file from the backend.
	$effect(() => {
		const file = $currentFile;
		if (file) {
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
		} else {
			pageContent = '';
			pristineContent = '';
		}
	});

	// This effect handles SAVING the file.
	$effect(() => {
		if (pageContent === undefined || !$currentFile || pageContent === pristineContent) {
			return;
		}

		clearTimeout(saveTimeout);
		const path = $currentFile.path;
		const contentToSave = pageContent;

		console.log("Change detected, scheduling save...");
		saveTimeout = window.setTimeout(() => {
			invoke('write_page_content', { path, content: contentToSave })
				.then(() => {
					console.log(`File saved successfully: ${path}`);
					pristineContent = contentToSave;
				})
				.catch((e) => console.error('Failed to save content:', e));
		}, 500);
	});

	onDestroy(() => {
		clearTimeout(saveTimeout);
	});

	function startResize(event: MouseEvent) {
		isResizing = true;
		window.addEventListener('mousemove', doResize);
		window.addEventListener('mouseup', stopResize);
	}
	function doResize(event: MouseEvent) {
		if (isResizing) {
			const newWidth = event.clientX;
			if (newWidth > 200 && newWidth < 600) {
				sidebarWidth = newWidth;
			}
		}
	}
	function stopResize() {
		isResizing = false;
		window.removeEventListener('mousemove', doResize);
		window.removeEventListener('mouseup', stopResize);
	}
</script>

<div class="chronicler-app">
	<Sidebar bind:width={sidebarWidth} />

	<div
		class="resizer"
		onmousedown={startResize}
		role="separator"
		aria-orientation="vertical"
		aria-valuenow={sidebarWidth}
		aria-valuemin={200}
		aria-valuemax={600}
	></div>

	<main class="main-content" style="--sidebar-width: {sidebarWidth}px">
		{#if $currentFile}
			<div class="editor-pane">
				{#if pageContent !== undefined}
					<!--
						**THE FIX:** The `bind:content` directive now correctly works
						with the updated Editor component, restoring the two-way data flow.
					-->
					<Editor bind:content={pageContent} />
				{/if}
			</div>
			<div class="preview-pane">
				<Preview content={pageContent} />
			</div>
		{:else}
			<div class="welcome-screen">
				<img src="/compass.svg" alt="Compass" class="welcome-icon" />
				<h1 class="welcome-title">Chronicler</h1>
				<p class="welcome-text">Select a page from the sidebar to begin your journey.</p>
			</div>
		{/if}
	</main>
</div>

<style>
	/* Styles remain the same */
	.chronicler-app {
		display: flex;
		height: 100vh;
		width: 100vw;
		background-image: url('/parchment.jpg');
		background-size: cover;
		color: #4a3f35;
		font-family: 'IM Fell English', serif;
	}
	.main-content {
		display: flex;
		flex-grow: 1;
		height: 100%;
		margin-left: var(--sidebar-width);
	}
	.resizer {
		width: 5px;
		cursor: ew-resize;
		background: #00000020;
		position: fixed;
		top: 0;
		bottom: 0;
		left: var(--sidebar-width);
		z-index: 100;
		transition: background-color 0.2s;
	}
	.resizer:hover {
		background: #00000040;
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
		border-right: 1px solid #d3c7b3;
	}
	.welcome-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		width: 100%;
	}
	.welcome-icon {
		width: 150px;
		height: 150px;
		opacity: 0.6;
		margin-bottom: 2rem;
	}
	.welcome-title {
		font-family: 'Uncial Antiqua', cursive;
		font-size: 4rem;
		margin-bottom: 1rem;
		color: #6a5f55;
	}
	.welcome-text {
		font-size: 1.2rem;
	}
</style>
