<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import TagIndexView from '$lib/components/TagIndexView.svelte';
	import FileView from '$lib/components/FileView.svelte';
	import BacklinksPanel from '$lib/components/BacklinksPanel.svelte';
	import { currentView, tags, fileViewMode, isRightSidebarVisible } from '$lib/stores';
	import type { PageHeader, TagMap } from '$lib/bindings';

	let sidebarWidth = $state(300);
	let isResizing = $state(false);

	// This effect keeps the TagIndexView reactive to backend changes.
	$effect(() => {
		const view = $currentView;
		const allTags: TagMap = $tags;

		if (view.type === 'tag' && view.data) {
			const currentTagName = view.data.name;
			const latestTagData = allTags.find(([name]) => name === currentTagName);

			if (latestTagData) {
				const newPagePaths = new Set(latestTagData[1]);
				const currentPagePaths = new Set(view.data.pages.map((p) => p.path));

				if (
					newPagePaths.size !== currentPagePaths.size ||
					![...newPagePaths].every((path) => currentPagePaths.has(path))
				) {
					const freshPages: PageHeader[] = latestTagData[1].map((path) => ({
						path,
						title: path.split(/[\\/]/).pop() || 'Untitled'
					}));

					currentView.set({
						type: 'tag',
						data: {
							name: currentTagName,
							pages: freshPages
						}
					});
				}
			} else {
				currentView.set({ type: 'welcome' });
			}
		}
	});

	// This effect resets the file view mode to 'preview' whenever the user
	// navigates away from the file view (e.g., to the welcome screen or a tag index).
	$effect(() => {
		if ($currentView.type !== 'file') {
			$fileViewMode = 'preview';
			isRightSidebarVisible.set(false); // Close right sidebar when leaving file view
		}
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
			<FileView file={$currentView.data} />
		{/if}
	</main>

	{#if $isRightSidebarVisible}
		<BacklinksPanel />
	{/if}
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
	.tag-view-pane {
		flex-basis: 100%;
		padding: 2rem;
		height: 100%;
		box-sizing: border-box;
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
