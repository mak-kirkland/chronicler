/**
 * @file This file contains reusable Svelte actions for direct DOM manipulation.
 * Svelte actions provide a way to hook into an element's lifecycle, making them
 * ideal for integrating third-party libraries or implementing custom behaviors
 * like autofocus and drag-and-drop.
 */

import { isDragging } from "$lib/dragStore";

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
 * @param params An object containing the data to be transferred.
 * - `path`: The unique identifier (e.g., file path) for the dragged item.
 */
export function draggable(node: HTMLElement, params: { path: string }) {
    function handleDragStart(e: DragEvent) {
        e.dataTransfer!.setData("text/plain", params.path);
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
 * @param params Optional parameters.
 * - `dropClass`: The CSS class to apply when an item is dragged over (default: 'drop-target').
 */
export function droppable(node: HTMLElement, params?: { dropClass?: string }) {
    let dragCounter = 0;
    const dropClass = params?.dropClass ?? "drop-target";

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
 * @param params Optional parameters.
 * - `scrollSpeed`: How fast to scroll (pixels per frame).
 * - `threshold`: The size of the "hot zone" at the top and bottom (in pixels).
 */
export function autoscrollOnDrag(
    node: HTMLElement,
    params?: { scrollSpeed?: number; threshold?: number },
) {
    const scrollSpeed = params?.scrollSpeed ?? 10;
    const threshold = params?.threshold ?? 60;

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
