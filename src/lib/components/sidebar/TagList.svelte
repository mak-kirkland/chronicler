<script lang="ts">
    import { navigateToTag } from "$lib/actions";
    import { t } from "$lib/i18n";
    import Icon from "$lib/components/ui/Icon.svelte";
    import type { TagMap } from "$lib/bindings";

    let { tags } = $props<{ tags: TagMap }>();
</script>

<div class="tag-list">
    {#if tags.length > 0}
        <!-- The #each block iterates over the 'tags' prop passed from the parent -->
        {#each tags as [tag, pages] (tag)}
            <div
                class="sidebar-row"
                onclick={() => navigateToTag(tag)}
                onkeydown={(e) => e.key === "Enter" && navigateToTag(tag)}
                role="button"
                tabindex="0"
            >
                <Icon type="tags" />
                <span class="tag-name">{tag}</span>
                <span class="row-count">{pages.length}</span>
            </div>
        {/each}
    {:else}
        <p class="text-muted text-center">{$t("sidebar.noTags")}</p>
    {/if}
</div>

<style>
    .tag-list {
        display: flex;
        flex-direction: column;
        font-size: 0.95rem;
    }
    .tag-name {
        flex-grow: 1;
        min-width: 0;
        color: var(--color-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
