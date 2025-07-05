<script lang="ts">
	import { files, isWorldLoaded } from '$lib/worldStore';
	import type { FileNode } from '$lib/bindings';
	import FileTree from './FileTree.svelte';
	import { filterFileTree } from '$lib/utils';

	// This component receives the search term from its parent (Sidebar).
	let { searchTerm = '' } = $props<{ searchTerm?: string }>();

	// Create a derived value for the filtered file tree.
	// This will automatically re-calculate whenever the fileTree store or searchTerm changes.
	const filteredNode = $derived(filterFileTree($files, searchTerm));
</script>

{#if filteredNode}
	<FileTree node={filteredNode} />
{:else if searchTerm}
	<p class="no-results">No files found.</p>
{:else if $isWorldLoaded}
	<p class="no-results">Your vault is empty.</p>
{:else}
	<p>Loading files...</p>
{/if}

<style>
	.no-results {
		color: var(--ink-light);
		text-align: center;
		font-style: italic;
		margin-top: 1rem;
	}
</style>
