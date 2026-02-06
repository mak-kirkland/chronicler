<script lang="ts">
    // This component displays a consistently styled error message.
    // It accepts an optional title and uses a slot for the error content.
    // The styling for `.error-box` has been moved to the global `app.css`
    // to ensure consistency between errors generated from the frontend
    // (using this component) and errors generated from the backend HTML renderer.
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
