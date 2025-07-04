<script lang="ts">
	import { rightSidebar, currentView } from '$lib/stores';
	import type { PageHeader } from '$lib/bindings';

	function handleLinkClick(file: PageHeader) {
		// When a backlink is clicked, navigate to that file.
		currentView.set({ type: 'file', data: file });
	}

	function closePanel() {
		rightSidebar.update((state) => ({ ...state, isVisible: false }));
	}
</script>

<aside class="right-sidebar">
	<div class="sidebar-header">
		<h3>Backlinks</h3>
		<button class="close-btn" onclick={closePanel} title="Close Panel"> &times; </button>
	</div>
	<div class="sidebar-content">
		{#if $rightSidebar.backlinks.length > 0}
			<ul>
				{#each $rightSidebar.backlinks as link (link.path)}
					<li>
						<button class="link-button" onclick={() => handleLinkClick(link)}>
							{link.title.replace('.md', '')}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="no-results">No backlinks found for this page.</p>
		{/if}
	</div>
</aside>

<style>
	.right-sidebar {
		width: 280px; /* Fixed width for the right sidebar */
		height: 100%;
		background-color: rgba(0, 0, 0, 0.03);
		border-left: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		flex-shrink: 0; /* Prevent the sidebar from shrinking */
	}
	.sidebar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid var(--border-color);
	}
	h3 {
		font-family: 'Uncial Antiqua', cursive;
		color: var(--ink-light);
		margin: 0;
		font-size: 1.2rem;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--ink-light);
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}
	.sidebar-content {
		padding: 1rem;
		overflow-y: auto;
		flex-grow: 1;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		margin-bottom: 0.5rem;
	}
	.link-button {
		background: none;
		border: none;
		padding: 0;
		color: #2563eb;
		text-decoration: none;
		border-bottom: 1px dotted #2563eb;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		font-size: 0.95rem;
	}
	.no-results {
		font-style: italic;
		color: var(--ink-light);
	}
</style>
