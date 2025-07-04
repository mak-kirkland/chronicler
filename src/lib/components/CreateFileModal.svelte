<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageHeader } from '$lib/bindings';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import { createNewFile, getAllDirectoryPaths, getVaultPath } from '$lib/commands';

	let {
		onClose = () => {},
		onFileCreated = (page: PageHeader) => {}
	} = $props<{
		onClose?: () => void;
		onFileCreated?: (page: PageHeader) => void;
	}>();

	let fileName = $state('');
	let selectedDir = $state('');
	let directories = $state<string[]>([]);
	let errorMessage = $state<string | null>(null);
	let isLoading = $state(true);
	let vaultRoot = $state('');

	onMount(async () => {
		try {
			const dirs = await getAllDirectoryPaths();
			const root = await getVaultPath();
			if (root) {
				vaultRoot = root;
				// Normalize paths for display and set initial selection
				directories = dirs
					.map((d) => d.replace(root, '').replaceAll('\\', '/'))
					.sort((a, b) => a.localeCompare(b));
				if (dirs.length > 0) {
					selectedDir = dirs[0];
				}
			}
		} catch (e) {
			errorMessage = `Failed to load directories: ${e}`;
		} finally {
			isLoading = false;
		}
	});

	async function handleCreateFile() {
		if (!fileName.trim() || !selectedDir) {
			errorMessage = 'File name and directory are required.';
			return;
		}
		errorMessage = null;
		try {
			const newPage = await createNewFile(selectedDir, fileName);
			onFileCreated(newPage);
			onClose();
		} catch (e) {
			console.error('Failed to create file:', e);
			errorMessage = `${e}`;
		}
	}
</script>

<Modal title="New Page" {onClose}>
	{#if isLoading}
		<p>Loading directories...</p>
	{:else}
		<div class="form-group">
			<label for="filename">Page Name</label>
			<input
				id="filename"
				type="text"
				bind:value={fileName}
				placeholder="My New Article"
				class="text-input"
			/>
		</div>
		<div class="form-group">
			<label for="directory">Location</label>
			<select id="directory" bind:value={selectedDir} class="select-input">
				{#each directories as dir, i}
					<option value={vaultRoot + dir}>{dir === '' ? '/' : dir}</option>
				{/each}
			</select>
		</div>

		{#if errorMessage}
			<p class="error-text">{errorMessage}</p>
		{/if}

		<div class="modal-actions">
			<Button on:click={handleCreateFile}> Create </Button>
		</div>
	{/if}
</Modal>

<style>
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	label {
		font-weight: bold;
		color: var(--ink-light);
	}
	.text-input,
	.select-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		background-color: var(--parchment);
		color: var(--ink);
		font-family: 'IM Fell English', serif;
		font-size: 1rem;
	}
	.text-input:focus,
	.select-input:focus {
		outline: 1px solid var(--accent-color);
		border-color: var(--accent-color);
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}
	.error-text {
		color: darkred;
		font-size: 0.9rem;
		margin: 0;
	}
</style>
