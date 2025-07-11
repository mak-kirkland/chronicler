/**
 * @file This file contains reusable Svelte actions for direct DOM manipulation.
 * Svelte actions provide a way to hook into an element's lifecycle, making them
 * ideal for integrating third-party libraries or implementing custom behaviors
 * like the autofocus action below.
 */

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
