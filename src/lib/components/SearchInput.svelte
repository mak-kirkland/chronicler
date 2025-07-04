<script lang="ts">
	let {
		value = $bindable(),
		placeholder = 'Search...'
	} = $props<{
		value?: string;
		placeholder?: string;
	}>();
</script>

<div class="search-container">
	<input
		type="search"
		bind:value={value}
		{placeholder}
		class="search-input"
	/>
</div>

<style>
	.search-container {
		padding: 0.75rem;
		border-bottom: 1px solid var(--border-color);
	}
	.search-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		background-color: var(--parchment);
		color: var(--ink);
		font-family: 'IM Fell English', serif;
		font-size: 0.95rem;
	}
	.search-input:focus {
		outline: 1px solid var(--accent-color);
		border-color: var(--accent-color);
	}
</style>
