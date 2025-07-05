<script lang="ts">
	let { content = $bindable() } = $props<{ content?: string }>();
</script>

<div class="editor-wrapper">
	<textarea
		bind:value={content}
		placeholder="Let your story unfold..."
	></textarea>
</div>

<style>
	.editor-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
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
