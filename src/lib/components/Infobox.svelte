<script lang="ts">
	import { tags } from '$lib/worldStore';
	import { navigateToTag } from '$lib/actions';
	import ErrorBox from './ErrorBox.svelte';

	// Define a more specific type for the 'data' prop for better type safety and clarity.
	type InfoboxData = {
		title?: string;
		image?: string;
		infobox?: string;
		error?: string;
		details?: string;
		tags?: string[];
		[key: string]: any; // Allow other dynamic properties from frontmatter
	};

	let { data, imageUrl } = $props<{ data: InfoboxData | null; imageUrl: string | null }>();

	let imageError = $state(false);
	let filteredData = $state<[string, any][]>([]);

	$effect(() => {
		imageError = false;

		// The check for null or non-object data is now even more robust with the new type.
		if (!data || typeof data !== 'object') {
			filteredData = [];
			return;
		}

		// These keys are handled separately in the template, so we filter them out.
		const excludedKeys = ['title', 'tags', 'infobox', 'image', 'error', 'details'];

		try {
			// Get all other key-value pairs from the data object to display in the list.
			const entries = Object.entries(data).filter(([key]) => !excludedKeys.includes(key));
			filteredData = entries;
		} catch (e) {
			console.error('Error processing infobox data:', e, data);
			filteredData = [];
		}
	});
</script>

<div class="infobox">
	{#if imageUrl && !imageError}
		<img
			src={imageUrl}
			alt={data?.title || 'Infobox image'}
			class="infobox-image"
			onerror={() => (imageError = true)}
		/>
	{/if}

	{#if imageError}
		<ErrorBox title="Image Error">Could not load image: "{data?.image}"</ErrorBox>
	{/if}

	{#if data?.error}
		<ErrorBox title="YAML Parse Error">
			{data.details || data.error}
		</ErrorBox>
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
					<button class="tag-link" onclick={() => navigateToTag(tag, $tags)}> #{tag} </button>
				{/each}
			</dd>
		{/if}
	</dl>
</div>

<style>
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
