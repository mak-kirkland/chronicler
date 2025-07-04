<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { fileTree, tags, appStatus, resetAllStores, currentView } from '$lib/stores';
	import type { FileNode, TagMap, PageHeader } from '$lib/bindings';
	import FileExplorer from './FileExplorer.svelte';
	import TagList from './TagList.svelte';
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import SettingsModal from './SettingsModal.svelte';
	import CreateFileModal from './CreateFileModal.svelte';
	import Button from './Button.svelte';
	import SearchInput from './SearchInput.svelte';

	let { width = $bindable() } = $props();
	let activeTab = $state<'files' | 'tags'>('files');
	let searchTerm = $state('');
	let showSettings = $state(false);
	let showCreateFile = $state(false);

	async function loadSidebarData() {
		try {
			const [tree, sortedTags] = await Promise.all([
				invoke<FileNode>('get_file_tree'),
				invoke<TagMap>('get_all_tags')
			]);
			fileTree.set(tree);
			tags.set(sortedTags);
		} catch (e) {
			console.error('Failed to load sidebar data:', e);
		}
	}

	onMount(() => {
		let unlistenFn: () => void;
		loadSidebarData();
		const setupListener = async () => {
			unlistenFn = await listen('index-updated', () => {
				console.log('Index update received from backend, refreshing sidebar data...');
				loadSidebarData();
			});
		};
		setupListener();
		return () => {
			if (unlistenFn) {
				unlistenFn();
			}
		};
	});

	function handleChangeVault() {
		showSettings = false;
		resetAllStores();
		appStatus.set('selecting_vault');
	}

	function handleFileCreated(page: PageHeader) {
		showCreateFile = false;
		currentView.set({ type: 'file', data: page });
	}

	const filteredTags = $derived(
		$tags.filter(([tag]) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
	);
</script>

{#if showSettings}
	<SettingsModal onClose={() => (showSettings = false)} onChangeVault={handleChangeVault} />
{/if}

{#if showCreateFile}
	<CreateFileModal onClose={() => (showCreateFile = false)} onFileCreated={handleFileCreated} />
{/if}

<aside style="width: {width}px;">
	<div class="sidebar-header">
		<h1 class="title">Chronicler</h1>
	</div>

	<SearchInput
		bind:value={searchTerm}
		placeholder={activeTab === 'files' ? 'Search files...' : 'Search tags...'}
	/>

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
			<FileExplorer {searchTerm} />
		{:else if activeTab === 'tags'}
			<TagList tags={filteredTags} />
		{/if}
	</div>

	<div class="sidebar-footer">
		<Button size="small" class="flex-grow" title="New Page" on:click={() => (showCreateFile = true)}>
			+ New Page
		</Button>
		<Button variant="ghost" title="Settings" on:click={() => (showSettings = true)}>
			⚙️
		</Button>
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
	.sidebar-footer {
		padding: 0.75rem;
		border-top: 1px solid var(--border-color);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	:global(.sidebar-footer .flex-grow) {
		flex-grow: 1;
	}
</style>
