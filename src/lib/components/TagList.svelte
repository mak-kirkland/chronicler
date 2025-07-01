<script lang="ts">
	import { tags } from '$lib/stores';
	import { navigateToTag } from '$lib/actions'; // Import the new centralized action

	// The local `viewTag` function has been removed.
</script>

<div class="tag-list">
	{#each $tags as [tag, pages] (tag)}
		<!-- The onclick handler now calls the imported navigateToTag function -->
		<div
			class="tag-group"
			onclick={() => navigateToTag(tag, $tags)}
			onkeydown={(e) => e.key === 'Enter' && navigateToTag(tag, $tags)}
			role="button"
			tabindex="0"
		>
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
</style>
