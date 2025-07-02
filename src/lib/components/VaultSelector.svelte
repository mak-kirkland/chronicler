<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';

	let { onVaultSelected = (path: string) => {} } = $props<{
		onVaultSelected?: (path: string) => void;
	}>();

	async function selectVault() {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: 'Select Your Vault Folder'
			});
			if (typeof selected === 'string') {
				onVaultSelected(selected);
			}
		} catch (e) {
			console.error('Error opening folder dialog:', e);
		}
	}
</script>

<div class="selector-container">
	<img src="/compass.svg" alt="Compass" class="welcome-icon" />
	<h1 class="welcome-title">Chronicler</h1>
	<p class="welcome-text">Please select a folder to use as your worldbuilding vault.</p>
	<button class="select-button" onclick={selectVault}> Choose Vault Folder </button>
</div>

<style>
	.selector-container {
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
	.welcome-text {
		font-size: 1.2rem;
		margin-bottom: 2rem;
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
		transition: all 0.2s;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
	}
	.select-button:hover {
		background-color: #a0522d; /* Slightly lighter accent */
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
	}
</style>
