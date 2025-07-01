<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { fileTree, tags } from '$lib/stores';
	import type { FileNode, TagMap } from '$lib/bindings';
	import FileTree from './FileTree.svelte';
	import TagList from './TagList.svelte';
	import { onMount } from 'svelte';

	let { width = $bindable() } = $props();
	let activeTab = $state<'files' | 'tags'>('files');

	async function loadInitialData() {
		try {
			const tree: FileNode = await invoke('get_file_tree');
			fileTree.set(tree);

			const sortedTags: TagMap = await invoke('get_all_tags');
			tags.set(sortedTags);

		} catch (e) {
			console.error('Failed to load initial data:', e);
		}
	}

	onMount(() => {
		// Initialize the backend and load data
		invoke('initialize').catch((e) => console.error('Failed to initialize backend:', e));
		loadInitialData();
	});
</script>

<aside style="width: {width}px;">
	<div class="sidebar-header">
		<h1 class="title">Chronicler</h1>
	</div>
	<div class="tab-navigation">
		<button class:active={activeTab === 'files'} onclick={() => (activeTab = 'files')}>
			Files
		</button>
		<button class:active={activeTab === 'tags'} onclick={() => (activeTab = 'tags')}>
			Tags
		</button>
	</div>
	<div class="sidebar-content">
		{#if activeTab === 'files'}
			{#if $fileTree}
				<FileTree node={$fileTree} />
			{:else}
				<p>Loading files...</p>
			{/if}
		{:else if activeTab === 'tags'}
			<TagList />
		{/if}
	</div>
</aside>

<style>
	aside {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.05);
		border-right: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		z-index: 50;
	}
	.sidebar-header {
		padding: 1rem;
		text-align: center;
		border-bottom: 1px solid var(--border-color);
	}
	.title {
		font-family: 'Uncial Antiqua', cursive;
		margin: 0;
		font-size: 2rem;
		color: var(--ink-light);
	}
	.tab-navigation {
		display: flex;
		border-bottom: 1px solid var(--border-color);
	}
	.tab-navigation button {
		flex: 1;
		padding: 0.75rem;
		background: none;
		border: none;
		font-family: 'IM Fell English', serif;
		font-size: 1rem;
		cursor: pointer;
		color: var(--ink-light);
		border-bottom: 2px solid transparent;
	}
	.tab-navigation button.active {
		border-bottom-color: var(--accent-color);
		font-weight: bold;
		color: var(--ink);
	}
	.sidebar-content {
		flex-grow: 1;
		overflow-y: auto;
		padding: 1rem;
	}
</style>
