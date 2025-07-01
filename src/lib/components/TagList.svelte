<script lang="ts">
	import { tags, currentView } from '$lib/stores';
	import type { PageHeader } from '$lib/bindings';

	function viewTag(tagName: string, pagePaths: string[]) {
		// Create an array of PageHeader objects from the list of paths.
		const pages: PageHeader[] = pagePaths.map((path) => ({
			path,
			title: path.split(/[\\/]/).pop() || 'Untitled'
		}));

		// Set the main view to show the tag index page.
		currentView.set({
			type: 'tag',
			data: {
				name: tagName,
				pages: pages
			}
		});
	}
</script>

<div class="tag-list">
	{#each $tags as [tag, pages]}
		<div class="tag-group" onclick={() => viewTag(tag, pages)} onkeydown={(e) => e.key === 'Enter' && viewTag(tag, pages)} role="button" tabindex="0">
			<span class="tag-name">#{tag}</span>
			<span class="tag-count">({pages.length})</span>
		</div>
	{/each}
</div>

<style>
	.tag-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.tag-group {
		padding: 0.3rem 0.6rem;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
	}
	.tag-group:hover, .tag-group:focus {
		background-color: rgba(0, 0, 0, 0.08);
		outline: none;
	}
	.tag-name {
		font-weight: bold;
		color: var(--accent-color);
	}
	.tag-count {
		color: var(--ink-light);
	}
</style>
