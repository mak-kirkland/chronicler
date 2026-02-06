<script lang="ts">
    import { navigateToTag } from "$lib/actions";
    import type { TagMap } from "$lib/bindings";

    let { tags } = $props<{ tags: TagMap }>();
</script>

<div class="tag-list">
    {#if tags.length > 0}
        <!-- The #each block iterates over the 'tags' prop passed from the parent -->
        {#each tags as [tag, pages] (tag)}
            <div
                class="tag-group"
                onclick={() => navigateToTag(tag)}
                onkeydown={(e) => e.key === "Enter" && navigateToTag(tag)}
                role="button"
                tabindex="0"
            >
                <span class="tag-name">#{tag}</span>
                <span class="tag-count">({pages.length})</span>
            </div>
        {/each}
    {:else}
        <p class="text-muted text-center">No tags found.</p>
    {/if}
</div>

<style>
    .tag-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .tag-group {
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
    }
    .tag-group:hover,
    .tag-group:focus {
        background-color: var(--color-background-secondary);
        outline: none;
    }
    .tag-name {
        font-weight: bold;
        color: var(--color-text-primary);
    }
    .tag-count {
        color: var(--color-text-secondary);
    }
</style>
