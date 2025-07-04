<script lang="ts">
	import { currentView } from '$lib/stores';
	import type { PageHeader } from '$lib/bindings';
	import type { TagIndexData } from '$lib/stores';

	let { data } = $props<{ data: TagIndexData }>();

	// Clicking a file link in this view switches back to the file view.
	function openFile(file: PageHeader) {
		currentView.set({ type: 'file', data: file });
	}
</script>

<div class="tag-index-wrapper">
	<h2>Index for <span class="tag-highlight">#{data.name}</span></h2>

	<ul class="page-link-list">
		{#each data.pages as page (page.path)}
			<li>
				<button onclick={() => openFile(page)}>
					{page.title.replace('.md', '')}
				</button>
			</li>
		{/each}
	</ul>
</div>

<style>
	.tag-index-wrapper {
		padding: 2rem;
		height: 100%;
		overflow-y: auto;
		box-sizing: border-box;
	}
	h2 {
		font-family: 'Uncial Antiqua', cursive;
		color: var(--ink-light);
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 0.5rem;
		margin-top: 0;
		margin-bottom: 1rem;
	}
	.tag-highlight {
		color: var(--accent-color);
		font-weight: bold;
	}
	.page-link-list {
		/* --- MODIFIED: Restore bullet points and add padding --- */
		list-style: disc;
		padding-left: 2rem; /* Add space for bullet points */
	}

	.page-link-list li {
		margin-bottom: 0.5rem; /* Add spacing between list items */
	}

	/* --- MODIFIED: Style the button to look like a blue link --- */
	.page-link-list button {
		width: auto; /* Allow the button to size to its content */
		text-align: left;
		background: none;
		border: none;
		padding: 0; /* Remove padding to make it look like a link */
		cursor: pointer;
		font-size: 1.1rem;
		font-family: inherit;
		/* Style to match internal links from Preview.svelte */
		color: #2563eb;
		text-decoration: none;
		border-bottom: 1px dotted #2563eb;
	}
	.page-link-list button:hover, .page-link-list button:focus {
		background-color: transparent; /* Ensure no background on hover */
		text-decoration: underline; /* Add underline on hover for clarity */
		outline: none;
	}
</style>
