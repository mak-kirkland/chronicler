/**
 * @file This file contains reusable Svelte actions for direct DOM manipulation.
 * Svelte actions provide a way to hook into an element's lifecycle, making them
 * ideal for integrating third-party libraries or implementing custom behaviors
 * like autofocus and drag-and-drop.
 */

import { isDragging } from "$lib/dragStore";
import type { RenderedPage } from "$lib/bindings";
import Carousel from "$lib/components/Carousel.svelte";
import { mount, unmount } from "svelte";

/**
 * A reusable Svelte action to programmatically focus an element when it is mounted to the DOM.
 * This is a more accessible alternative to the `autofocus` attribute.
 *
 * @param node The HTML element to which the action is applied.
 */
export function autofocus(node: HTMLElement) {
    // By wrapping the focus call in a `setTimeout` with a 0ms delay, we push this
    // operation to the end of the browser's event queue. This ensures that all other
    // DOM rendering and component lifecycle events have completed before we try to
    // set the focus, making it much more reliable.
    setTimeout(() => {
        node.focus();
    }, 0);
}

// --- Drag and Drop Actions ---

/**
 * Action to make an element draggable.
 * @param node The HTML element.
 * @param path The unique identifier string (e.g., file path).
 */
export function draggable(node: HTMLElement, path: string) {
    // We keep a local reference to the current path
    let currentPath = path;

    function handleDragStart(e: DragEvent) {
        // Use the currentPath, which matches the latest update
        e.dataTransfer!.setData("text/plain", currentPath);
        e.dataTransfer!.effectAllowed = "move";
        // Set the global store to true
        isDragging.set(true);
    }

    function handleDragEnd() {
        // Always set the global store to false when the drag ends
        isDragging.set(false);
    }

    node.draggable = true;
    node.addEventListener("dragstart", handleDragStart);
    node.addEventListener("dragend", handleDragEnd);

    return {
        update(newPath: string) {
            // When the component updates, just swap the path variable.
            // No need to destroy listeners or the draggable attribute.
            currentPath = newPath;
        },
        destroy() {
            node.draggable = false;
            node.removeEventListener("dragstart", handleDragStart);
            node.removeEventListener("dragend", handleDragEnd);
        },
    };
}

/**
 * Action to make an element a drop zone.
 * @param node The HTML element that will become a drop zone.
 */
export function droppable(node: HTMLElement) {
    const dropClass = "drop-target";
    let dragCounter = 0;

    function handleDragEnter(e: DragEvent) {
        e.preventDefault();
        dragCounter++;
        node.classList.add(dropClass);
    }

    function handleDragLeave() {
        dragCounter--;
        if (dragCounter === 0) {
            node.classList.remove(dropClass);
        }
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();

        const sourcePath = e.dataTransfer?.getData("text/plain");
        if (sourcePath) {
            node.dispatchEvent(
                // Emit a new custom event for the Svelte component to
                // listen to and decide what to do on a drop event.
                new CustomEvent("filesdropped", {
                    detail: { sourcePath },
                }),
            );
        }

        // Clean up visual state
        dragCounter = 0;
        node.classList.remove(dropClass);
    }

    node.addEventListener("dragenter", handleDragEnter);
    node.addEventListener("dragleave", handleDragLeave);
    node.addEventListener("dragover", handleDragOver);
    node.addEventListener("drop", handleDrop);

    return {
        destroy() {
            node.removeEventListener("dragenter", handleDragEnter);
            node.removeEventListener("dragleave", handleDragLeave);
            node.removeEventListener("dragover", handleDragOver);
            node.removeEventListener("drop", handleDrop);
        },
    };
}

/**
 * This action makes a scrollable container automatically scroll when a
 * dragged item is held near its top or bottom edge.
 * @param node The scrollable HTML element.
 */
export function autoscrollOnDrag(node: HTMLElement) {
    const scrollSpeed = 10;
    const threshold = 60;

    let animationFrameId: number | null = null;
    let scrollDirection: "up" | "down" | null = null;

    function scrollLoop() {
        if (scrollDirection === "up") {
            node.scrollTop -= scrollSpeed;
        } else if (scrollDirection === "down") {
            node.scrollTop += scrollSpeed;
        }
        if (scrollDirection) {
            animationFrameId = requestAnimationFrame(scrollLoop);
        }
    }

    function startScrolling(direction: "up" | "down") {
        if (scrollDirection === direction) return; // Already scrolling this way
        scrollDirection = direction;
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(scrollLoop);
        }
    }

    function stopScrolling() {
        scrollDirection = null;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function handleDragOver(e: DragEvent) {
        const rect = node.getBoundingClientRect();
        const y = e.clientY;

        if (y < rect.top + threshold) {
            startScrolling("up");
        } else if (y > rect.bottom - threshold) {
            startScrolling("down");
        } else {
            stopScrolling();
        }
    }

    // Stop scrolling if the drag leaves the element or the entire window
    node.addEventListener("dragleave", stopScrolling);
    document.addEventListener("dragend", stopScrolling);
    document.addEventListener("drop", stopScrolling);

    node.addEventListener("dragover", handleDragOver);

    return {
        destroy() {
            node.removeEventListener("dragover", handleDragOver);
            node.removeEventListener("dragleave", stopScrolling);
            document.removeEventListener("dragend", stopScrolling);
            document.removeEventListener("drop", stopScrolling);
            // Final cleanup
            stopScrolling();
        },
    };
}

/**
 * Attaches a lightweight, dependency-free sorting listener to tables.
 *
 * A table is considered "sortable" if it *does not* contain any `colspan` or
 * `rowspan` attributes.
 *
 * This action will also automatically create a `<thead>` from the first row
 * if one is not present, ensuring the header is not sorted.
 *
 * @param node The root HTML element containing the rendered Markdown.
 * @param renderedData The rendered page data. The action will react to changes in this object.
 */
export function tablesort(
    node: HTMLElement,
    renderedData: RenderedPage | null,
) {
    // Store pairs of (element, eventListener) for proper cleanup
    let listeners: [HTMLElement, (e: Event) => void][] = [];

    /**
     * The main sort function.
     * @param th The <th> element that was clicked.
     * @param table The <table> being sorted.
     */
    function sortTable(th: HTMLTableCellElement, table: HTMLTableElement) {
        const colIndex = th.cellIndex;
        const tbody = table.tBodies[0];
        if (!tbody) return;

        const rows = Array.from(tbody.rows);

        // Determine sort direction
        let currentSort = th.getAttribute("aria-sort") || "none";
        const newSort =
            currentSort === "ascending" ? "descending" : "ascending";

        // Reset other columns
        for (const header of table.querySelectorAll("th")) {
            header.removeAttribute("aria-sort");
        }
        th.setAttribute("aria-sort", newSort);

        // The sorting comparator function
        const comparator = (a: HTMLTableRowElement, b: HTMLTableRowElement) => {
            const valA = a.cells[colIndex]?.textContent || "";
            const valB = b.cells[colIndex]?.textContent || "";

            // Use localeCompare. It handles "10" vs "2" and "Item 10" vs "Item 2"
            // and mixed content like "100" vs "N/A".
            const compareResult = valA.localeCompare(valB, undefined, {
                numeric: true,
            });

            return newSort === "ascending" ? compareResult : -compareResult;
        };

        // Sort the rows and re-append them
        rows.sort(comparator);
        tbody.append(...rows);
    }

    function initialize(data: RenderedPage | null) {
        // 1. Destroy any existing listeners
        for (const [el, listener] of listeners) {
            el.removeEventListener("click", listener);
        }
        listeners = [];

        // 2. Do nothing if there's no data to render
        if (!data) return;

        // 3. Find all tables within the node
        const allTables = node.querySelectorAll<HTMLTableElement>("table");

        for (const table of allTables) {
            // Heuristic 1: Must not have merged cells
            const hasMergedCells = table.querySelector("[colspan], [rowspan]");
            if (hasMergedCells) {
                continue; // Skip this table
            }

            // Heuristic 2: Ensure a <thead> exists
            let thead = table.querySelector("thead");
            if (!thead) {
                continue;
            }

            // 4. Add the 'sortable-table' class for styling
            table.classList.add("sortable-table");

            // 5. Add click listeners to each header cell
            for (const th of thead.querySelectorAll("th")) {
                th.setAttribute("role", "columnheader");
                const listener = () => sortTable(th, table);
                th.addEventListener("click", listener);
                // Store the listener so we can remove it later
                listeners.push([th, listener]);
            }
        }
    }

    // Run the logic when the action is first mounted
    initialize(renderedData);

    return {
        /**
         * The `update` function is called by Svelte whenever the parameter
         * (renderedData) changes.
         */
        update(newData: RenderedPage | null) {
            initialize(newData);
        },

        /**
         * The `destroy` function is called by Svelte when the component is unmounted.
         */
        destroy() {
            for (const [el, listener] of listeners) {
                el.removeEventListener("click", listener);
            }
        },
    };
}


/**
 * A Svelte action that scans a node for static `.carousel` divs,
 * extracts their image data, and replaces them with interactive
 * `Carousel` components.
 */
export function hydrateCarousels(node: HTMLElement, _data: any) {
    let mountedComponents: any[] = [];

    function update() {
        // 1. Cleanup previous components
        mountedComponents.forEach((comp) => unmount(comp));
        mountedComponents = [];

        // 2. Find all .carousel containers in the raw HTML
        const carousels = node.querySelectorAll(".carousel");

        carousels.forEach((el) => {
            // 3. Extract Image Data (and captions if present)
            const imgs = Array.from(el.querySelectorAll("img"));
            if (imgs.length === 0) return;

            const imagesData = imgs.map((img) => {
                let caption: string | undefined = undefined;

                // Check if the image is wrapped in a <figure> and has a <figcaption>
                const parent = img.parentElement;
                if (parent && parent.tagName.toLowerCase() === "figure") {
                    const figEl = parent.querySelector("figcaption");
                    if (figEl) {
                        caption = figEl.innerHTML;
                    }
                }

                return {
                    src: img.getAttribute("src") || "",
                    alt: img.getAttribute("alt") || "",
                    title: img.getAttribute("title") || undefined,
                    caption
                };
            });

            // 4. Capture existing classes (e.g. "carousel small")
            // This allows us to pass "small" or "large" to the component.
            const className = el.className;

            // 5. Clear the static HTML content
            el.innerHTML = "";

            // 6. Mount the interactive Svelte Component
            const comp = mount(Carousel, {
                target: el,
                props: {
                    images: imagesData,
                    className: className // Pass the class names
                },
            });
            mountedComponents.push(comp);
        });
    }

    // Run immediately
    update();

    return {
        update, // Re-run when renderedData changes
        destroy() {
            mountedComponents.forEach((comp) => unmount(comp));
        },
    };
}
