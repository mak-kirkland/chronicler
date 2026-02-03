<script lang="ts">
    import { atmosphere } from "$lib/settingsStore";
    import { licenseStore } from "$lib/licenseStore";
    import { atmospheres, coreAtmosphere } from "$lib/atmospheres";
    import { iconPacks, type IconType, type IconPack } from "$lib/icons";

    // Define the props interface explicitly
    interface IconProps {
        type: IconType;
        className?: string;
    }

    // Apply the interface to the props
    let { type, className = "" }: IconProps = $props();

    // Explicitly derive the current pack data
    const currentPackData = $derived.by<IconPack>(() => {
        const selectedPackId = $atmosphere.icons;

        // First, check if it's a standalone icon pack (like "legacy")
        // that isn't tied to an atmosphere pack
        const standaloneIconPack = iconPacks[selectedPackId];
        if (standaloneIconPack) {
            // "core" and "legacy" are always available for free
            if (selectedPackId === "core" || selectedPackId === "legacy") {
                return standaloneIconPack;
            }
        }

        // Look up the Product (Atmosphere) for premium packs
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

        // 3. Fallback to default
        return coreAtmosphere.iconSet;
    });

    const iconContent = $derived(
        currentPackData.icons[type] || coreAtmosphere.iconSet.icons[type],
    );

    // Check if the icon content is an image path (for "img" type packs)
    // or a text fallback (for missing icons in img packs)
    const isImagePath = $derived(
        currentPackData.type === "img" && iconContent.startsWith("/"),
    );
</script>

{#if currentPackData.type === "img"}
    {#if isImagePath}
        <!-- External SVG image with CSS mask for accent color -->
        <span
            class="themed-icon img-icon {className}"
            style="--icon-url: url('{iconContent}')"
            aria-hidden="true"
        ></span>
    {:else}
        <!-- Text fallback for missing icons in img packs -->
        <span class="themed-icon text-icon {className}" aria-hidden="true">
            {iconContent}
        </span>
    {/if}
{:else if currentPackData.type === "svg"}
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

    .img-icon {
        /*
         * Use CSS mask-image to apply accent color to external SVG files.
         * The SVG acts as a mask, and the background-color fills the visible areas.
         * This allows the icon to take on var(--color-accent-primary).
         *
         * Note: SVG files should ideally have their shapes in black for best results.
         */
        -webkit-mask-image: var(--icon-url);
        mask-image: var(--icon-url);
        -webkit-mask-size: contain;
        mask-size: contain;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        background-color: var(--color-icons);
    }
</style>
