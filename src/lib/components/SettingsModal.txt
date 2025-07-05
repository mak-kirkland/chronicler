<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import { open } from '@tauri-apps/plugin-dialog';
	import { world } from '$lib/worldStore';
	import { isPandocInstalled, downloadPandoc, importDocxFiles } from '$lib/commands';

	let {
		onClose = () => {},
		onChangeVault = () => {}
	} = $props<{
		onClose?: () => void;
		onChangeVault?: () => void;
	}>();

	let pandocInstalled = $state(false);
	let isInstalling = $state(false);
	let importMessage = $state<string | null>(null);

	$effect(() => {
		isPandocInstalled()
			.then((installed) => {
				pandocInstalled = installed;
			})
			.catch((err) => {
				console.error('Failed to check pandoc status:', err);
				pandocInstalled = false;
			});
	});

	async function installPandoc() {
		if (
			!window.confirm(
				'This feature requires Pandoc, a universal document converter. Allow Chronicler to download it? (This is a one-time download of approx. 200MB).'
			)
		) {
			return;
		}

		isInstalling = true;
		importMessage = 'Downloading and setting up Pandoc...';
		try {
			await downloadPandoc();
			pandocInstalled = true;
			importMessage = 'Pandoc installed successfully! You can now import files.';
		} catch (e) {
			console.error('Pandoc installation failed:', e);
			importMessage = `Failed to install Pandoc: ${e}`;
		} finally {
			isInstalling = false;
		}
	}

	async function importFiles() {
		if (!pandocInstalled) {
			await installPandoc();
			// If installation was successful, the user can click again to import.
			return;
		}

		try {
			const selected = await open({
				multiple: true,
				filters: [{ name: 'Word Document', extensions: ['docx'] }]
			});

			if (Array.isArray(selected) && selected.length > 0) {
				const paths = selected;
				importMessage = `Importing ${paths.length} file(s)...`;
				await importDocxFiles(paths);

				// Manually trigger a refresh after import
				await world.initialize();

				alert(`${paths.length} file(s) imported successfully!`);
				onClose();
			}
		} catch (e) {
			console.error('File import failed:', e);
			alert(`File import failed: ${e}`);
		}
	}
</script>

<Modal title="Settings" {onClose}>
	<div class="setting-item">
		<h4>Change Vault</h4>
		<p>Change the root folder for your notes.</p>
		<Button on:click={onChangeVault}> Change Vault Folder </Button>
	</div>

	<div class="setting-item">
		<h4>Import</h4>
		<p>Import .docx files as new Markdown pages in your vault's root directory.</p>
		<Button on:click={importFiles} disabled={isInstalling}>
			{#if isInstalling}
				Installing Pandoc...
			{:else if !pandocInstalled}
				Install Pandoc & Import
			{:else}
				Import from .docx
			{/if}
		</Button>
		{#if importMessage}
			<p class="import-message">{importMessage}</p>
		{/if}
	</div>
</Modal>

<style>
	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
		margin-bottom: 1rem;
	}
	.setting-item:last-child {
		border-bottom: none;
		margin-bottom: 0;
	}
	h4 {
		font-family: 'Uncial Antiqua', cursive;
		margin: 0;
		color: var(--ink-light);
	}
	.setting-item p {
		margin: 0;
		color: var(--ink);
		font-size: 0.95rem;
	}
	.import-message {
		font-size: 0.9rem;
		font-style: italic;
		color: var(--ink-light);
		margin-top: 0.5rem !important;
	}
</style>
