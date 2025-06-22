<script lang="ts">
	import { currentFile } from '$lib/stores';

	// **THE FIX:** This is the correct Svelte 5 syntax for creating a two-way
	// bindable prop. It must be destructured from the `$props()` rune.
	// This restores the direct data connection to the parent page.
	let { content = $bindable() } = $props<{ content?: string }>();
</script>

<div class="editor-wrapper">
	{#if $currentFile}
		<h2>{$currentFile.title.replace('.md', '')}</h2>
		<!--
			The `bind:value` now works directly with the bindable `content` prop,
			ensuring that any changes made by the user are immediately reflected
			in the `pageContent` state of the parent component.
		-->
		<textarea
			bind:value={content}
			placeholder="Let your story unfold..."
		></textarea>
	{/if}
</div>

<style>
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
