<script lang="ts">
	import {
		currentView,
		tags,
		fileViewMode,
		isRightSidebarVisible
	} from '$lib/stores';
	import type { PageHeader, TagMap } from '$lib/bindings';
	import TagIndexView from '$lib/components/TagIndexView.svelte';
	import FileView from '$lib/components/FileView.svelte';
	import BacklinksPanel from '$lib/components/BacklinksPanel.svelte';

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
</script>

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

{#if $isRightSidebarVisible}
	<BacklinksPanel />
{/if}


<style>
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
