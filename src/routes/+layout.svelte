<script lang="ts">
	// This file now only handles importing global styles.
	// The main application structure has been moved to +page.svelte.
	import '../app.css';
</script>

<!--
  The <slot /> tag is required by SvelteKit. It will render the
  content from src/routes/+page.svelte.
-->
<slot />
