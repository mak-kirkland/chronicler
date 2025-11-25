<script lang="ts">
    import Button from "./Button.svelte";
    import { open } from "@tauri-apps/plugin-dialog";

    let { onVaultSelected = (_path: string) => {} } = $props<{
        onVaultSelected?: (path: string) => void;
    }>();

    async function selectVault() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Select Your Vault Folder",
            });
            if (typeof selected === "string") {
                onVaultSelected(selected);
            }
        } catch (e) {
            console.error("Error opening folder dialog:", e);
        }
    }
</script>

<div class="selector-container">
    <img src="/logo.png" alt="Chronicler Logo" class="welcome-icon" />
    <h1 class="welcome-title">Chronicler</h1>
    <p class="welcome-text">
        Please select a folder to use as your worldbuilding vault.
    </p>
    <Button onclick={selectVault}>Change Vault Folder</Button>
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
        color: var(--color-text-primary);
    }
    .welcome-icon {
        width: 150px;
        height: 150px;
        margin-bottom: 2rem;
    }
    .welcome-title {
        font-family: var(--font-family-heading);
        font-size: 4rem;
        margin-bottom: 1rem;
        color: var(--color-text-heading);
    }
    .welcome-text {
        font-size: 1.2rem;
        margin-bottom: 2rem;
    }
</style>
