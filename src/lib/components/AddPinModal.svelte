<script lang="ts">
    import { onMount } from "svelte";
    import type { MapData, MapPin, PageHeader } from "$lib/bindings";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import { autofocus } from "$lib/domActions";
    import { world } from "$lib/worldStore";
    import { get } from "svelte/store";
    import { closeModal } from "$lib/modalStore";
    import { flattenFileTree, getTitleFromPath } from "$lib/utils";

    let { mapData, coords, pinToEdit, onClose, onSave } = $props<{
        mapData: MapData;
        coords?: { x: number; y: number };
        pinToEdit?: MapPin;
        onClose: () => void;
        onSave: (pin: MapPin) => void;
    }>();

    let localPin = $state<MapPin>({
        id: pinToEdit?.id || crypto.randomUUID(),
        name: pinToEdit?.name || "",
        x: pinToEdit?.x || coords?.x || 0,
        y: pinToEdit?.y || coords?.y || 0,
        linked_page_path: pinToEdit?.linked_page_path || null,
        icon: pinToEdit?.icon || "default",
        color: pinToEdit?.color || "#FFFFFF",
    });

    let searchTerm = $state(
        pinToEdit?.linked_page_path
            ? getTitleFromPath(pinToEdit.linked_page_path)
            : "",
    );
    let allPages: PageHeader[] = [];

    onMount(() => {
        const files = get(world).files;
        if (files) {
            allPages = flattenFileTree(files);
        }
    });

    const searchResults = $derived(
        searchTerm
            ? allPages.filter((page) =>
                  page.title.toLowerCase().includes(searchTerm.toLowerCase()),
              )
            : [],
    );

    function handleSubmit(event: SubmitEvent) {
        event.preventDefault();
        if (!localPin.name.trim()) {
            alert("Pin name cannot be empty.");
            return;
        }

        // Pass the new/updated pin data up to the parent.
        onSave(localPin);
        closeModal();
    }

    function selectPage(page: PageHeader) {
        localPin.linked_page_path = page.path;
        searchTerm = page.title;
    }
</script>

<Modal title={pinToEdit ? "Edit Pin" : "Add Pin"} {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <div class="form-group">
            <label for="pin-name">Name</label>
            <input
                id="pin-name"
                type="text"
                bind:value={localPin.name}
                use:autofocus
            />
        </div>

        <div class="form-group">
            <label for="pin-link">Link to Page (optional)</label>
            <input
                id="pin-link"
                type="search"
                bind:value={searchTerm}
                placeholder="Search for a page..."
            />
            {#if searchTerm && searchResults.length > 0}
                <ul class="search-results">
                    {#each searchResults as page (page.path)}
                        <li>
                            <button
                                type="button"
                                onclick={() => selectPage(page)}
                            >
                                {page.title}
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <div class="style-grid">
            <div class="form-group">
                <label for="pin-icon">Icon</label>
                <select id="pin-icon" bind:value={localPin.icon}>
                    <option value="default">Default</option>
                    <option value="🏰">Castle</option>
                    <option value="🏙️">City</option>
                    <option value="🏡">Town</option>
                    <option value="⛰️">Mountain</option>
                    <option value="🌲">Forest</option>
                    <option value="🌊">Water</option>
                    <option value="⚔️">Battle</option>
                    <option value="❓">Unknown</option>
                </select>
            </div>
            <div class="form-group">
                <label for="pin-color">Color</label>
                <input
                    id="pin-color"
                    type="color"
                    bind:value={localPin.color}
                />
            </div>
        </div>

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button type="submit">Save Pin</Button>
        </div>
    </form>
</Modal>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        position: relative;
    }
    .style-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
    .search-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-top: none;
        border-radius: 0 0 6px 6px;
        list-style: none;
        padding: 0;
        margin: 0;
        max-height: 150px;
        overflow-y: auto;
        z-index: 10;
    }
    .search-results button {
        width: 100%;
        padding: 0.5rem;
        text-align: left;
        background: none;
        border: none;
        color: var(--color-text-primary);
        cursor: pointer;
    }
    .search-results button:hover {
        background: var(--color-background-tertiary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
