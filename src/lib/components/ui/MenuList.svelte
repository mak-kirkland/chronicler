<script lang="ts">
    /**
     * MenuList.svelte
     *
     * The shared *action* menu: a list of rows where picking one does
     * something, as opposed to `Select`, where picking one sets a value. Used
     * by the right-click context menu, the sidebar's New Page split button and
     * its vault switcher.
     *
     * `Select` got a controller, ARIA roles and keyboard navigation early; the
     * action menus were each hand-rolled and got none of it. This is the same
     * extraction applied to them: `FloatingMenu` still owns positioning and
     * click-outside, `.dropdown-menu` in app.css still owns the surface, and
     * this owns the rows, the roving highlight and the keys.
     */
    import FloatingMenu from "$lib/components/ui/FloatingMenu.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import {
        ListNavigator,
        handleListNavigation,
    } from "$lib/ListNavigator.svelte";
    import type { ContextMenuItem, MenuAction } from "$lib/types";

    let {
        isOpen,
        items,
        onClose,
        anchorEl = null,
        x = 0,
        y = 0,
        width = undefined,
        align = "start",
        triggerEl = null,
    } = $props<{
        isOpen: boolean;
        items: ContextMenuItem[];
        onClose: () => void;
        /** Anchor to an element (dropdowns). Omit for raw coordinates. */
        anchorEl?: HTMLElement | null;
        x?: number;
        y?: number;
        width?: number;
        align?: "start" | "end";
        /** Focus returns here on Escape. Defaults to `anchorEl`. */
        triggerEl?: HTMLElement | null;
    }>();

    /**
     * Only actionable rows take part in navigation — arrowing onto a heading
     * or a separator would be a dead keypress.
     */
    const actions = $derived(
        items.filter(
            (i: ContextMenuItem) => !i.isSeparator && !i.isHeading,
        ) as MenuAction[],
    );

    /** Whether any row wants the leading column: an icon or a checkmark. */
    const hasLeading = $derived(
        actions.some(
            (a: MenuAction) => a.icon !== undefined || a.checked !== undefined,
        ),
    );

    const nav = new ListNavigator<MenuAction>([]);
    $effect(() => {
        nav.setOptions(actions);
    });

    let listEl = $state<HTMLElement | null>(null);
    let itemEls: HTMLElement[] = [];

    // The list takes focus so it receives keys. Menus portal to <body>, so
    // there's nothing above them to compete for the keyboard.
    $effect(() => {
        if (isOpen) listEl?.focus();
    });

    function run(item: MenuAction) {
        onClose();
        item.handler();
    }

    /**
     * Where focus goes when the menu closes on Escape.
     *
     * Anchors are often a positioning wrapper rather than the control itself —
     * FloatingMenu measures a box, so callers hand it a div or span. Calling
     * .focus() on one of those does nothing and focus falls to <body>, so look
     * inside for the real control first.
     */
    function focusTarget(): HTMLElement | null {
        if (triggerEl) return triggerEl;
        if (!anchorEl) return null;
        if (anchorEl.matches("button, [href], input, [tabindex]")) {
            return anchorEl;
        }
        return anchorEl.querySelector("button, [href], input, [tabindex]");
    }

    function handleKeydown(e: KeyboardEvent) {
        handleListNavigation(e, {
            isOpen,
            nav,
            // Options aren't 1:1 with children here — separators and headings
            // sit among them — so resolve the element by option index.
            getItemEl: (i: number) => itemEls[i],
            onSelect: (item: MenuAction) => run(item),
            onClose,
            // Row 0 is highlighted on open, so Tab must not commit it.
            selectOnTab: false,
            triggerElement: focusTarget(),
        });
    }
</script>

{#if isOpen}
    <FloatingMenu {isOpen} {anchorEl} {x} {y} {width} {align} {onClose}>
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <div
            class="menu-list"
            role="menu"
            tabindex="-1"
            bind:this={listEl}
            onkeydown={handleKeydown}
        >
            {#each items as item, i (i)}
                {#if item.isSeparator}
                    <hr />
                {:else if item.isHeading}
                    <span class="eyebrow menu-heading">{item.label}</span>
                {:else}
                    {@const index = actions.indexOf(item)}
                    <button
                        type="button"
                        role={item.checked === undefined
                            ? "menuitem"
                            : "menuitemcheckbox"}
                        aria-checked={item.checked}
                        class:highlighted={index === nav.index}
                        title={item.title}
                        bind:this={itemEls[index]}
                        onclick={() => run(item)}
                        onmousemove={() => (nav.index = index)}
                    >
                        {#if hasLeading}
                            <span class="leading" aria-hidden="true">
                                {#if item.checked !== undefined}
                                    {item.checked ? "✓" : ""}
                                {:else if item.icon}
                                    <Icon type={item.icon} />
                                {/if}
                            </span>
                        {/if}
                        <span class="label">{item.label}</span>
                    </button>
                {/if}
            {/each}
        </div>
    </FloatingMenu>
{/if}

<style>
    /* Surface, hover, separators and inset all come from .dropdown-menu in
       app.css. Only the row layout is local. */
    .menu-list {
        display: flex;
        flex-direction: column;
        outline: none;
    }

    .menu-list button {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .leading {
        /* Fixed-width gutter so labels line up whether a row leads with an
           icon, a checkmark, or nothing at all. */
        width: 1.15rem;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .menu-heading {
        display: block;
        padding: 4px 0.6rem 2px;
    }
</style>
