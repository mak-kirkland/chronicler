<script lang="ts">
	import Modal from './Modal.svelte';

	let {
		onClose = () => {},
		onChangeVault = () => {}
	} = $props<{
		onClose?: () => void;
		onChangeVault?: () => void;
	}>();
</script>

<Modal title="Settings" {onClose}>
	<p>Manage your application settings here.</p>
	<button class="action-button" onclick={onChangeVault}>
		Change Vault Folder
	</button>
</Modal>

<style>
	p {
		margin-bottom: 0; /* Adjusted from 1.5rem to look better with the new layout */
	}
	.action-button {
		padding: 0.5rem 1rem;
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
</style>
