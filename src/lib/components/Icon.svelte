<script lang="ts">
    import { atmosphere } from "$lib/settingsStore";
    import { licenseStore } from "$lib/licenseStore";
    import { atmospheres, coreAtmosphere } from "$lib/atmospheres";

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
    // Logic: User Setting -> Lookup Atmosphere Product -> Check Ownership -> Return Icon Asset
    const currentPackData = $derived.by(() => {
        const selectedPackId = $atmosphere.icons;
        // Look up the Product (Atmosphere)
        const pack = atmospheres[selectedPackId];

        // 1. Core pack is always available.
        if (pack && pack.id === "core") {
            return pack.iconSet;
        }

        // 2. Check entitlements for premium packs.
        const entitlements = $licenseStore.license?.entitlements || [];
        const hasEntitlement = pack && entitlements.includes(pack.id);

        if (pack && hasEntitlement) {
            return pack.iconSet;
        }

        // 3. Fallback to default if pack doesn't exist or isn't owned.
        return coreAtmosphere.iconSet;
    });

    const iconContent = $derived(
        currentPackData.icons[type] || coreAtmosphere.iconSet.icons[type],
    );
</script>

{#if currentPackData.type === "svg"}
    <!-- svelte-ignore a11y_hidden -->
    <svg
        class="themed-icon {className}"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        {@html iconContent}
    </svg>
{:else}
    <span class="themed-icon text-icon {className}" aria-hidden="true">
        {iconContent}
    </span>
{/if}

<style>
    .themed-icon {
        width: 1.2em;
        height: 1.2em;
        vertical-align: middle;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .text-icon {
        font-size: 1.1em;
        line-height: 1;
        /* Ensure emojis/text render nicely aligned */
        transform: translateY(-1px);
    }
</style>
