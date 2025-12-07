<script lang="ts">
    import { atmosphere } from "$lib/settingsStore";
    import { licenseStore } from "$lib/licenseStore";
    import { iconPacks, defaultPack } from "$lib/icons";

    let { type, className = "" } = $props<{
        type:
            | "folder"
            | "folderOpen"
            | "file"
            | "image"
            | "tags"
            | "gallery"
            | "reports"
            | "back"
            | "forward"
            | "settings"
            | "help"
            | "info"
            | "edit"
            | "preview"
            | "split"
            | "contents"
            | "backlinks"
            | "close"
            | "newFile"
            | "newFolder"
            | "bold"
            | "italic"
            | "strikethrough"
            | "heading1"
            | "heading2"
            | "heading3";
        className?: string;
    }>();

    // Derived logic to determine which icon pack to use.
    // Logic: User Setting -> Do they own it? -> If not, Fallback to Default.
    const currentPackData = $derived.by(() => {
        // Updated to use the icons module from the atmosphere store
        const selectedPackId = $atmosphere.icons;
        const pack = iconPacks[selectedPackId];

        // 1. Core pack is always available.
        if (pack && pack.id === "core") {
            return pack;
        }

        // 2. Check entitlements for premium packs.
        const features = $licenseStore.license?.features || [];
        const hasEntitlement = pack && features.includes(pack.id);

        if (pack && hasEntitlement) {
            return pack;
        }

        // 3. Fallback to default if pack doesn't exist or isn't owned.
        return defaultPack;
    });

    // Get the specific SVG path string for the requested type.
    const iconPath = $derived(
        currentPackData.icons[type] || defaultPack.icons[type],
    );
</script>

<!-- svelte-ignore a11y_hidden -->
<svg
    class="themed-icon {className}"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
>
    {@html iconPath}
</svg>

<style>
    .themed-icon {
        width: 1.2em;
        height: 1.2em;
        vertical-align: middle;
        /* Allow parent to color it via CSS color property */
        flex-shrink: 0;
    }
</style>
