<script lang="ts">
	import { tags } from '$lib/stores';
	import { navigateToTag } from '$lib/actions'; // Import the new centralized action

	// The props and local state remain the same
	let { data, imageUrl } = $props<{ data: any; imageUrl: string | null }>();
	let imageError = $state(false);
	let filteredData = $state<[string, any][]>([]);

	$effect(() => {
		// This effect for filtering data remains the same
		imageError = false;

		if (!data || typeof data !== 'object') {
			filteredData = [];
			return;
		}

		const excludedKeys = ['title', 'tags', 'infobox', 'image', 'error', 'details'];

		try {
			const entries = Object.entries(data).filter(([key]) => !excludedKeys.includes(key));
			filteredData = entries;
		} catch (e) {
			console.error('Error processing infobox data:', e, data);
			filteredData = [];
		}
	});

	// The local `viewTag` function has been removed.
</script>

<div class="infobox">
	{#if imageUrl && !imageError}
		<img
			src={imageUrl}
			alt={data.name || 'Infobox image'}
			class="infobox-image"
			onerror={() => (imageError = true)}
		/>
	{/if}

	{#if imageError}
		<div class="error-box">Could not load image: "{data.image}"</div>
	{/if}

	{#if data?.error}
		<div class="error-box">
			<strong>YAML Parse Error:</strong>
			{data.details || data.error}
		</div>
	{/if}

	{#if data?.infobox}
		<h4>{data.infobox}</h4>
	{/if}

	<dl>
		{#each filteredData as [key, value]}
			<dt>{key}</dt>
			<dd>
				{#if Array.isArray(value)}
					<ul>
						{#each value as item}
							<li>{@html item}</li>
						{/each}
					</ul>
				{:else}
					{@html value}
				{/if}
			</dd>
		{:else}
			{#if data && !data.error && filteredData.length === 0 && (!data.tags || data.tags.length === 0)}
				<div class="no-fields-message">No additional fields to display.</div>
			{/if}
		{/each}

		<!-- Section for rendering tags -->
		{#if data?.tags && Array.isArray(data.tags) && data.tags.length > 0}
			<dt>Tags</dt>
			<dd class="tag-container">
				{#each data.tags as tag (tag)}
					<!-- The onclick handler now calls the imported navigateToTag function -->
					<button class="tag-link" onclick={() => navigateToTag(tag, $tags)}> #{tag} </button>
				{/each}
			</dd>
		{/if}
	</dl>
</div>

<style>
	/* All styles remain exactly the same */
	.infobox {
		background-color: rgba(0, 0, 0, 0.03);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 2rem;
		font-size: 0.9rem;
	}
	.infobox-image {
		width: 100%;
		border-radius: 4px;
		margin-bottom: 1rem;
		border: 1px solid var(--border-color);
	}
	.error-box {
		background-color: rgba(139, 0, 0, 0.1);
		color: darkred;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		font-size: 0.85rem;
		border: 1px solid rgba(139, 0, 0, 0.2);
	}
	.no-fields-message {
		font-style: italic;
		color: var(--ink-light);
		grid-column: 1 / -1;
		text-align: center;
		padding: 0.5rem;
	}
	h4 {
		font-family: 'Uncial Antiqua', cursive;
		margin-top: 0;
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 0.5rem;
		margin-bottom: 1rem;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		align-items: baseline;
	}
	dt {
		font-weight: bold;
		text-transform: capitalize;
		color: var(--ink-light);
	}
	dd {
		margin: 0;
	}
	dd ul {
		margin: 0;
		padding-left: 1.2rem;
	}
	:global(.infobox a) {
		color: var(--accent-color);
		text-decoration: none;
	}
	.tag-container {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.tag-link {
		background-color: rgba(0, 0, 0, 0.07);
		color: var(--accent-color);
		padding: 0.2rem 0.6rem;
		border-radius: 9999px; /* pill shape */
		font-size: 0.8rem;
		font-weight: bold;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.2s ease-in-out;
		font-family: 'IM Fell English', serif;
	}
	.tag-link:hover,
	.tag-link:focus {
		background-color: var(--accent-color);
		color: var(--parchment);
		outline: none;
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}
</style>
