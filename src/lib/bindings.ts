/**
 * @file This file contains TypeScript interfaces that mirror the data structures
 * defined in the Rust backend's `src-tauri/src/models.rs`. Keeping these in sync
 * is crucial for type safety across the frontend/backend boundary.
 *
 * For UI-specific or component-level types, see `types.ts`.
 */

// This file contains TypeScript interfaces for the data structures
// defined in the Rust backend's `models.rs`. Keeping these in sync
// is crucial for type safety between frontend and backend.

export interface PageHeader {
	title: string;
	path: string; // In Rust this is PathBuf
}

export interface FileNode {
	name: string;
	path: string; // In Rust this is PathBuf
	is_directory: boolean;
	children?: FileNode[];
}

export type TagMap = [string, PageHeader[]][];

export interface RenderedPage {
	processed_frontmatter: any; // This is a JSON object
	rendered_html: string;
}

// The corresponding TypeScript interface for the new backend struct.
// It contains everything needed to render the FileView.
export interface FullPageData {
	raw_content: string;
	rendered_page: RenderedPage;
	backlinks: PageHeader[];
}
