<script lang="ts">
    import { appState } from "$lib/state/appState.svelte";

    // Initialize app state on mount
    $effect(() => {
        appState.init();
    });
</script>

<svelte:head>
    <title>Chronicler - D&D Worldbuilding App</title>
    <meta name="description" content="Offline D&D worldbuilding notebook" />
    <link href="https://fonts.googleapis.com/css2?family=Merriweather&family=Fira+Code&display=swap" rel="stylesheet" />
</svelte:head>

<div class="app-container">
    <slot />
</div>

<style>
    :global(:root) {
        --bg-primary: #1e1e2e;
        --bg-secondary: #252536;
        --text-primary: #e0def4;
        --text-secondary: #908caa;
        --accent-color: #ebbcba;
        --link-color: #9ccfd8;
        --tag-color: #c4a7e7;
        --border-color: #44415a;
        --success-color: #9ccfd8;
    }

    :global(body) {
        margin: 0;
        padding: 0;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-family: 'Merriweather', serif;
        height: 100vh;
        overflow: hidden;
    }

    .app-container {
        display: flex;
        height: 100vh;
        overflow: hidden;
    }
</style>