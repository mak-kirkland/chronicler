<script lang="ts">
	import { navigateToTag } from '$lib/actions';
	import type { TagMap } from '$lib/bindings';
	import { tags as allTagsStore } from '$lib/stores';

	// Provide a standard default value for the optional prop.
	// You cannot use the $state rune as a default value for a prop.
	let { tags = [] } = $props<{ tags?: TagMap }>();
</script>

<div class="tag-list">
	{#if tags.length > 0}
		<!-- The #each block iterates over the 'tags' prop passed from the parent -->
		{#each tags as [tag, pages] (tag)}
			<div
				class="tag-group"
				onclick={() => navigateToTag(tag, $allTagsStore)}
				onkeydown={(e) => e.key === 'Enter' && navigateToTag(tag, $allTagsStore)}
				role="button"
				tabindex="0"
			>
				<span class="tag-name">#{tag}</span>
				<span class="tag-count">({pages.length})</span>
			</div>
		{/each}
	{:else}
		<p class="no-results">No tags found.</p>
	{/if}
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
	.tag-group:hover,
	.tag-group:focus {
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
	.no-results {
		color: var(--ink-light);
		text-align: center;
		font-style: italic;
	}
</style>
