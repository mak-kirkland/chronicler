<script lang="ts">
	let { data, imageUrl } = $props<{ data: any; imageUrl: string | null }>();
	let imageError = $state(false);

	// **THE FIX:** Using an $effect here makes the component more robust. It will
	// reliably re-calculate the filtered data whenever the `data` prop changes.
	let filteredData = $state<[string, any][]>([]);

	$effect(() => {
		// Reset the image error state whenever new data is received.
		imageError = false;

		// Guard against null or non-object data to prevent errors.
		if (!data || typeof data !== 'object') {
			filteredData = [];
			return;
		}

		const excludedKeys = ['title', 'tags', 'infobox', 'image', 'error', 'details'];

		try {
			// This logic now runs reliably inside the effect.
			const entries = Object.entries(data).filter(([key]) => !excludedKeys.includes(key));
			filteredData = entries;
		} catch (e) {
			console.error("Error processing infobox data:", e, data);
			filteredData = [];
		}
	});

	function renderValue(value: any) {
		if (typeof value !== 'string') return String(value);

		const html = value.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
			const text = alias || target;
			return `<a href="#" data-link-target="${target.trim()}">${text.trim()}</a>`;
		});
		return html;
	}
</script>

<div class="infobox">
	{#if imageUrl && !imageError}
		<img
			src={imageUrl}
			alt={data.name || 'Infobox image'}
			class="infobox-image"
			onerror={() => imageError = true}
		/>
	{/if}

	{#if imageError}
		<div class="error-box">
			Could not load image: "{data.image}"
		</div>
	{/if}

	{#if data?.error}
		<div class="error-box">
			<strong>YAML Parse Error:</strong> {data.details || data.error}
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
							<li>{@html renderValue(item)}</li>
						{/each}
					</ul>
				{:else}
					{@html renderValue(value)}
				{/if}
			</dd>
		{:else}
			{#if data && !data.error && filteredData.length === 0}
				<div class="no-fields-message">
					No additional fields to display.
				</div>
			{/if}
		{/each}
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
</style>
