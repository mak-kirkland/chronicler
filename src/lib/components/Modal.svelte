<script lang="ts">
	let { title = 'Modal Title', onClose = () => {} } = $props<{
		title?: string;
		onClose?: () => void;
	}>();
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="modal-backdrop" onclick={onClose}>
	<div class="modal-content" onclick={(event) => event.stopPropagation()}>
		<div class="modal-header">
			<h3>{title}</h3>
			<button class="close-btn" onclick={onClose}>&times;</button>
		</div>
		<div class="modal-body">
			<slot />
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}
	.modal-content {
		background-image: url('/parchment.jpg');
		background-color: #fdf6e3;
		background-size: cover;
		padding: 2rem;
		border-radius: 8px;
		border: 2px solid var(--border-color);
		width: 100%;
		max-width: 500px;
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
		color: var(--ink);
	}
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 1rem;
		margin-bottom: 1rem;
	}
	.modal-header h3 {
		font-family: 'Uncial Antiqua', cursive;
		font-size: 1.5rem;
		color: var(--ink-light);
		margin: 0;
	}
	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		color: var(--ink-light);
		cursor: pointer;
	}
	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
</style>
