/**
 * @file This file contains TypeScript interfaces that mirror the data structures
 * defined in the Rust backend's `src-tauri/src/models.rs`. Keeping these in sync
 * is crucial for type safety across the frontend/backend boundary.
 *
 * For UI-specific or component-level types, see `types.ts`.
 */

/**
 * A specific type for the file node category. This improves type safety
 * over using a generic string. It mirrors the `FileType` enum in Rust.
 */
export type FileType = "Directory" | "Markdown" | "Image";

/**
 * A lightweight representation of a page, containing only the data needed
 * for list views and navigation links.
 */
export interface PageHeader {
    /** The display title of the page. */
    title: string;
    /** The absolute path to the page file. */
    path: string; // In Rust this is PathBuf
}

/**
 * Represents a single node (a file or a directory) in the vault's file system tree.
 */
export interface FileNode {
    /** The display name of the file or folder. */
    name: string;
    /** The absolute path to the file or folder. */
    path: string; // In Rust this is PathBuf
    /** The type of the file node. */
    file_type: FileType;
    /** An optional array of child nodes, present only for directories. */
    children?: FileNode[];
}

/**
 * A type alias for the structure of the tag data returned from the backend.
 * It's an array of tuples, where each tuple contains a tag name (string)
 * and an array of pages (`PageHeader`) that have that tag.
 */
export type TagMap = [string, PageHeader[]][];

/**
 * Contains the processed frontmatter and rendered HTML for a page preview.
 */
export interface RenderedPage {
    /** The page's frontmatter, parsed as a flexible JSON object. */
    processed_frontmatter: any;
    /** The page's body content, fully rendered from Markdown to HTML. */
    rendered_html: string;
}

/**
 * A lightweight representation of an incoming link (a backlink), including
 * the number of times the source page links to the target.
 */
export interface Backlink {
    /** The display title of the page containing the link. */
    title: string;
    /** The absolute path to the page containing the link. */
    path: string;
    /** The number of times the source page links to the current page. */
    count: number;
}

/**
 * A comprehensive data structure containing all information needed to
 * render the main file view, including raw content, rendered HTML, and backlinks.
 */
export interface FullPageData {
    /** The raw, un-rendered Markdown content of the page. */
    raw_content: string;
    /** The rendered version of the page for display. */
    rendered_page: RenderedPage;
    /** A list of all pages that link to this page. */
    backlinks: Backlink[];
}

/**
 * Represents the structure of a validated license.
 * This mirrors the `License` struct in `src-tauri/src/models.rs`.
 */
export interface License {
    key: string;
    status: string;
    expiry: string;
}
