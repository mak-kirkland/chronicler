<script lang="ts">
	// The component no longer imports from stores.

	// It now accepts 'content' (bindable) and 'title' as props.
	let { content = $bindable(), title = '' } = $props<{ content?: string; title?: string }>();
</script>

<div class="editor-wrapper">
	<h2>{title.replace('.md', '')}</h2>

	<textarea
		bind:value={content}
		placeholder="Let your story unfold..."
	></textarea>
</div>

<style>
	/* All styles remain the same */
	.editor-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	h2 {
		font-family: 'Uncial Antiqua', cursive;
		color: var(--ink-light);
		margin-top: 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border-color);
	}
	textarea {
		flex-grow: 1;
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		font-family: 'IM Fell English', serif;
		font-size: 1.1rem;
		line-height: 1.8;
		color: var(--ink);
		box-sizing: border-box;
		padding-right: 1rem;
	}
</style>
