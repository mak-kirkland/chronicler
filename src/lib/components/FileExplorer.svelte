<script lang="ts">
	import { fileTree } from '$lib/stores';
	import type { FileNode } from '$lib/bindings';
	import FileTree from './FileTree.svelte';

	// This component receives the search term from its parent (Sidebar).
	let { searchTerm = '' } = $props<{ searchTerm?: string }>();

	// This recursive function filters the file tree based on the search term,
	// preserving the directory structure. It is now correctly located
	// with the component that uses it.
	function filterFileTree(node: FileNode | null, term: string): FileNode | null {
		if (!node) return null;
		const lowerCaseTerm = term.toLowerCase();

		// If it's a file, check if its name matches the search term.
		if (!node.children) {
			return node.name.toLowerCase().includes(lowerCaseTerm) ? node : null;
		}

		// If it's a directory, filter its children recursively.
		const filteredChildren = node.children
			.map((child) => filterFileTree(child, term))
			.filter((child): child is FileNode => child !== null); // Keep only non-null results

		// A directory should be kept if its name matches or if it has any children left after filtering.
		if (node.name.toLowerCase().includes(lowerCaseTerm) || filteredChildren.length > 0) {
			return { ...node, children: filteredChildren };
		}

		return null;
	}

	// Create a derived value for the filtered file tree.
	// This will automatically re-calculate whenever the fileTree store or searchTerm changes.
	const filteredNode = $derived(filterFileTree($fileTree, searchTerm));
</script>

{#if filteredNode}
	<FileTree node={filteredNode} />
{:else if searchTerm}
	<p class="no-results">No files found.</p>
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
