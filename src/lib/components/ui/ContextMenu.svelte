<script lang="ts">
    /**
     * ContextMenu.svelte
     *
     * A right-click menu: `MenuList` positioned at raw coordinates instead of
     * anchored to a control. Everything else — rows, icons, checkmarks,
     * keyboard navigation, Escape — lives in MenuList, shared with the
     * sidebar's menus.
     */
    import type { ContextMenuItem } from "$lib/types";
    import MenuList from "$lib/components/ui/MenuList.svelte";

    let { x, y, actions, onClose } = $props<{
        x: number;
        y: number;
        actions: ContextMenuItem[];
        onClose: () => void;
    }>();
</script>

<MenuList isOpen={true} items={actions} {x} {y} {onClose} />
