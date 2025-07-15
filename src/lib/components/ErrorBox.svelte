<script lang="ts">
    // This component displays a consistently styled error message.
    // It accepts an optional title and uses a slot for the error content.
    let { children, title = "Error" } = $props<{
        children: any;
        title?: string;
    }>();
</script>

<div class="error-box">
    {#if title}
        <strong>{title}:</strong>
    {/if}
    {@render children()}
</div>

<style>
    .error-box {
        background-color: var(--color-background-error);
        color: var(--color-text-error);
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
        font-size: 0.85rem;
        border: 1px solid var(--color-border-error);
    }
    strong {
        display: block;
        margin-bottom: 0.25rem;
    }
</style>
