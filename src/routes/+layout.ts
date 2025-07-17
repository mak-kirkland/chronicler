/**
 * This file configures the SvelteKit adapter for a Single-Page Application (SPA) mode,
 * which is essential for Tauri applications.
 *
 * `export const prerender = true;`
 * This tells SvelteKit to generate a static HTML file for each page at build time.
 *
 * `export const ssr = false;`
 * This is the most critical setting. It disables Server-Side Rendering,
 * informing the bundler that the application will run exclusively on the
 * client-side.
 */
export const prerender = true;
export const ssr = false;
