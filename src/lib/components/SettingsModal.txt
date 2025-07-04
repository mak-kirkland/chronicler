<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	let {
		onClose = () => {},
		onChangeVault = () => {}
	} = $props<{
		onClose?: () => void;
		onChangeVault?: () => void;
	}>();
</script>

<Modal title="Settings" {onClose}>
	<div class="setting-item">
		<p>Change the root folder for your notes.</p>
		<Button on:click={onChangeVault}>
			Change Vault Folder
		</Button>
	</div>
</Modal>

<style>
	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.setting-item p {
		margin: 0;
		color: var(--ink-light);
	}
</style>
