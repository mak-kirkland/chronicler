<script lang="ts">
    import { vaultPath, world, files } from "$lib/worldStore";
    import { writePageContent } from "$lib/commands";
    import { navigateToCanvas } from "$lib/actions";
    import { registerCanvas } from "$lib/canvasStore";
    import { emptyCanvas } from "$lib/canvasModels";
    import { join } from "@tauri-apps/api/path";
    import { autofocus } from "$lib/domActions";
    import { normalizePath, findNodeByPath } from "$lib/utils";
    import Button from "$lib/components/ui/Button.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import { log } from "$lib/logger";
    import { t, translate } from "$lib/i18n";

    let { onClose, parentDir } = $props<{
        onClose: () => void;
        parentDir?: string;
    }>();

    let name = $state("");
    let isCreating = $state(false);

    async function handleSubmit(event?: Event) {
        if (event) event.preventDefault();
        const dir = parentDir ?? $vaultPath;
        if (!name.trim() || !dir) return;
        isCreating = true;
        try {
            const filename = `${name.trim()}.canvas`;
            const filePath = await join(dir, filename);
            const normalizedPath = normalizePath(filePath);
            // writePageContent overwrites, so guard against clobbering an
            // existing canvas with an empty one.
            if (findNodeByPath($files, normalizedPath)) {
                alert(translate("canvas.alreadyExists", { name: name.trim() }));
                return;
            }
            const data = emptyCanvas();

            await writePageContent(
                normalizedPath,
                JSON.stringify(data, null, 2),
            );
            registerCanvas(normalizedPath, data);
            await world.initialize();
            onClose();
            navigateToCanvas({ title: name.trim(), path: normalizedPath });
        } catch (e) {
            log.error("Failed to create canvas", e, "NewCanvasModal");
            alert(translate("canvas.createFailed"));
        } finally {
            isCreating = false;
        }
    }
</script>

<Modal title={$t("canvas.newTitle")} {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <div class="form-group">
            <label for="canvas-name">{$t("canvas.nameLabel")}</label>
            <input
                id="canvas-name"
                type="text"
                bind:value={name}
                use:autofocus
                placeholder={$t("canvas.namePlaceholder")}
            />
        </div>
        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >{$t("common.cancel")}</Button
            >
            <Button type="submit" disabled={!name.trim() || isCreating}>
                {isCreating ? $t("canvas.creating") : $t("canvas.create")}
            </Button>
        </div>
    </form>
</Modal>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    label {
        font-weight: bold;
        color: var(--color-text-secondary);
    }
    input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    input:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
