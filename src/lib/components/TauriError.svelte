<!-- Error display for Tauri API issues -->
<script lang="ts">
    let error = $state<string | null>(null);

    // Check if Tauri is available on mount
    $effect(() => {
        if (typeof window !== 'undefined' && typeof window.__TAURI__ === 'undefined') {
            error = "Tauri API not available - running in browser mode";
        }
    });
</script>

{#if error}
    <div class="tauri-error">
        ⚠️ {error} - Some features may be limited
    </div>
{/if}

<style>
    .tauri-error {
        background: #ffecb3;
        color: #ff6f00;
        padding: 10px;
        border-radius: 4px;
        margin: 10px 0;
        font-size: 0.9em;
        text-align: center;
    }
</style>