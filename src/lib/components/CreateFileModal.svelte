<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import type { PageHeader } from '$lib/bindings';
	import Modal from './Modal.svelte';

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
			const dirs = await invoke<string[]>('get_all_directory_paths');
			const root = await invoke<string | null>('get_vault_path');
			if (root) {
				vaultRoot = root;
				// Sort and set directories, making them relative for display
				directories = dirs
					.map((d) => d.replace(root, '').replaceAll('\\', '/'))
					.sort((a, b) => a.localeCompare(b));
				selectedDir = dirs[0]; // Default to the root
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
			const newPage = await invoke<PageHeader>('create_new_file', {
				parentDir: selectedDir,
				fileName: fileName
			});
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
				{#each directories as dir}
					<option value={vaultRoot + dir}>{dir === '' ? '/' : dir}</option>
				{/each}
			</select>
		</div>

		{#if errorMessage}
			<p class="error-text">{errorMessage}</p>
		{/if}

		<div class="modal-actions">
			<button class="action-button" onclick={handleCreateFile}> Create </button>
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
	.action-button {
		padding: 0.5rem 1.5rem;
		background-color: var(--accent-color);
		color: var(--parchment);
		border: 1px solid rgba(211, 199, 179, 0.5);
		border-radius: 6px;
		cursor: pointer;
		font-family: inherit;
		font-size: 1rem;
	}
	.action-button:hover {
		background-color: #a0522d;
	}
	.error-text {
		color: darkred;
		font-size: 0.9rem;
		margin: 0;
	}
</style>
