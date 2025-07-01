<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import TagIndexView from '$lib/components/TagIndexView.svelte';
	import { currentView } from '$lib/stores';
	import { invoke } from '@tauri-apps/api/core';
	import { onDestroy } from 'svelte';

	let sidebarWidth = $state(300);
	let isResizing = $state(false);

	let pageContent = $state<string | undefined>(undefined);
	let pristineContent = $state<string | undefined>(undefined);
	let saveTimeout: number;

	let fileViewMode: 'preview' | 'split' = $state('preview');

	$effect(() => {
		const view = $currentView;
		fileViewMode = 'preview'; // Reset to preview mode on any view change

		// If the new view is a file, load its content
		if (view.type === 'file' && view.data) {
			pageContent = undefined;
			pristineContent = undefined;
			invoke<string>('get_page_content', { path: view.data.path })
				.then((content) => {
					pageContent = content;
					pristineContent = content;
				})
				.catch((e) => {
					console.error('Failed to get page content:', e);
					const errorContent = `# Error\n\nCould not load file: ${view.data?.path}`;
					pageContent = errorContent;
					pristineContent = errorContent;
				});
		} else {
			// Clear content for other views
			pageContent = undefined;
			pristineContent = undefined;
		}
	});

	$effect(() => {
		const view = $currentView;
		if (
			pageContent === undefined ||
			view.type !== 'file' ||
			!view.data ||
			pageContent === pristineContent
		) {
			return;
		}

		clearTimeout(saveTimeout);
		const path = view.data.path;
		const contentToSave = pageContent;

		saveTimeout = window.setTimeout(() => {
			invoke('write_page_content', { path, content: contentToSave })
				.then(() => {
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
		{#if $currentView.type === 'welcome'}
			<div class="welcome-screen">
				<img src="/compass.svg" alt="Compass" class="welcome-icon" />
				<h1 class="welcome-title">Chronicler</h1>
				<p class="welcome-text">Select a page from the sidebar to begin your journey.</p>
			</div>
		{:else if $currentView.type === 'tag'}
			<div class="tag-view-pane">
				<TagIndexView data={$currentView.data} />
			</div>
		{:else if $currentView.type === 'file' && $currentView.data}
			{#if fileViewMode === 'split'}
				<!-- Split View: Editor + Preview -->
				<div class="editor-pane">
					{#if pageContent !== undefined}
						<Editor bind:content={pageContent} title={$currentView.data.title} />
					{/if}
				</div>
				<div class="preview-pane">
					<button class="mode-toggle-btn" onclick={() => (fileViewMode = 'preview')}>
						📖 Preview Only
					</button>
					<Preview content={pageContent} />
				</div>
			{:else}
				<!-- Preview-Only View -->
				<div class="preview-pane full-width">
					<button class="mode-toggle-btn" onclick={() => (fileViewMode = 'split')}>
						✏️ Edit
					</button>
					<Preview content={pageContent} />
				</div>
			{/if}
		{/if}
	</main>
</div>

<style>
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
		position: relative; /* For the button */
	}
	.editor-pane {
		border-right: 1px solid #d3c7b3;
	}
	.preview-pane.full-width, .tag-view-pane {
		flex-basis: 100%;
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
