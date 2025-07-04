<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { appStatus, resetAllStores } from '$lib/stores';
	import { initializeVault } from '$lib/actions';
	import VaultSelector from '$lib/components/VaultSelector.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import '../app.css';

	let sidebarWidth = $state(300);
	let isResizing = $state(false);
	let errorMessage = $state<string | null>(null);

	onMount(async () => {
		errorMessage = null;
		try {
			const path = await invoke<string | null>('get_vault_path');
			if (path) {
				await initializeVault(path);
			} else {
				$appStatus = 'selecting_vault';
			}
		} catch (e: any) {
			console.error('Failed during startup initialization:', e);
			errorMessage = e.message || `Failed to read configuration: ${e}`;
			$appStatus = 'error';
		}
	});

	async function handleVaultSelected(path: string) {
		errorMessage = null;
		try {
			await initializeVault(path);
		} catch (e: any) {
			errorMessage = e.message;
			$appStatus = 'error';
		}
	}

	function handleTryAgain() {
		resetAllStores();
		$appStatus = 'selecting_vault';
	}

	function startResize(event: MouseEvent) {
		isResizing = true;
		// Add the passive option for better scroll performance during resize.
		window.addEventListener('mousemove', doResize, { passive: true });
		window.addEventListener('mouseup', stopResize);
	}

	function doResize(event: MouseEvent) {
		if (isResizing) {
			const newWidth = event.clientX;
			if (newWidth > 200 && newWidth < 600) {
				sidebarWidth = newWidth;
			}
		}
	}

	function stopResize() {
		isResizing = false;
		window.removeEventListener('mousemove', doResize);
		window.removeEventListener('mouseup', stopResize);
	}
</script>

{#if $appStatus === 'selecting_vault'}
	<VaultSelector onVaultSelected={handleVaultSelected} />
{:else if $appStatus === 'loading'}
	<div class="loading-screen">
		<img src="/compass.svg" alt="Compass" class="welcome-icon animate-spin" />
		<h1 class="welcome-title">Opening Vault...</h1>
	</div>
{:else if $appStatus === 'error'}
	<div class="loading-screen">
		<h1 class="welcome-title">Error</h1>
		<p class="error-message">{errorMessage}</p>
		<button class="select-button" onclick={handleTryAgain}>Select a Different Folder</button>
	</div>
{:else if $appStatus === 'ready'}
	<div class="chronicler-app" style="--sidebar-width: {sidebarWidth}px">
		<Sidebar bind:width={sidebarWidth} />

		<div
			class="resizer"
			onmousedown={startResize}
			role="separator"
			aria-orientation="vertical"
			aria-valuenow={sidebarWidth}
			aria-valuemin={200}
			aria-valuemax={600}
		></div>

		<main class="main-content">
                  <!--
                      The <slot /> tag is required by SvelteKit. It will render the
                      content from src/routes/+page.svelte.
                    -->
			<slot />
		</main>
	</div>
{/if}

<style>
	.loading-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		width: 100vw;
		height: 100vh;
		background-image: url('/parchment.jpg');
		background-size: cover;
		color: #4a3f35;
		padding: 2rem;
	}
	.error-message {
		background-color: rgba(139, 0, 0, 0.1);
		color: darkred;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 2rem;
		max-width: 600px;
		border: 1px solid rgba(139, 0, 0, 0.2);
	}
	.select-button {
		padding: 0.75rem 1.5rem;
		background-color: var(--accent-color);
		color: var(--parchment);
		border: 1px solid rgba(211, 199, 179, 0.5);
		border-radius: 6px;
		cursor: pointer;
		font-family: 'IM Fell English', serif;
		font-size: 1.1rem;
	}
	.chronicler-app {
		display: flex;
		height: 100vh;
		width: 100vw;
		background-image: url('/parchment.jpg');
		background-size: cover;
		color: #4a3f35;
		font-family: 'IM Fell English', serif;
	}
	.main-content {
		display: flex;
		flex-grow: 1;
		height: 100%;
		margin-left: var(--sidebar-width);
	}
	.resizer {
		width: 5px;
		cursor: ew-resize;
		background: #00000020;
		position: fixed;
		top: 0;
		bottom: 0;
		left: var(--sidebar-width);
		z-index: 100;
		transition: background-color 0.2s;
	}
	.resizer:hover {
		background: #00000040;
	}
	.welcome-icon {
		width: 150px;
		height: 150px;
		opacity: 0.6;
		margin-bottom: 2rem;
	}
	.welcome-title {
		font-family: 'Uncial Antiqua', cursive;
		font-size: 4rem;
		margin-bottom: 1rem;
		color: #6a5f55;
	}
	.animate-spin {
		animation: spin 2s linear infinite;
	}
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
