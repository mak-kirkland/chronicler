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
 * Represents a single entry in the Table of Contents.
 * This mirrors the `TocEntry` struct in Rust.
 */
export interface TocEntry {
    /** The hierarchical number of the entry (e.g., "1.2"). */
    number: string;
    /** The text content of the header. */
    text: string;
    /** The level of the header (1-6). */
    level: number;
    /** The URL-friendly ID generated for the header. */
    id: string;
}

/**
 * Contains the processed frontmatter and rendered HTML for a page preview.
 */
export interface RenderedPage {
    /** The page's frontmatter, parsed as a flexible JSON object. */
    processed_frontmatter: any;
    /** The portion of the rendered HTML that comes *before* the first header. */
    html_before_toc: string;
    /** The portion of the rendered HTML that comes *from* the first header onwards. */
    html_after_toc: string;
    /** The generated Table of Contents for the page. */
    toc: TocEntry[];
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
 * This mirrors the `License` struct in `src-tauri/src/licensing.rs`.
 */
export interface License {
    key: string;
    status: string;
    expiry: string;
    entitlements: string[];
}

/**
 * Represents a broken link report from the backend.
 * This mirrors the `BrokenLink` struct in `src-tauri/src/models.rs`.
 */
export interface BrokenLink {
    /** The target name of the link that could not be resolved. */
    target: string;
    /** A list of all pages that contain a link to this target. */
    sources: PageHeader[];
}

/**
 * Represents a broken image report from the backend.
 * This mirrors the `BrokenImage` struct in `src-tauri/src/models.rs`.
 */
export interface BrokenImage {
    /** The filename or path of the image that could not be found. */
    target: string;
    /** A list of all pages that embed this image. */
    sources: PageHeader[];
}

/**
 * Represents a single entry in the parse error report.
 * This mirrors the `ParseError` struct in `src-tauri/src/models.rs`.
 */
export interface ParseError {
    /** The header of the page that failed to parse. */
    page: PageHeader;
    /** The detailed error message. */
    error: string;
}

/**
 * Represents a single user-provided font, prepared for frontend consumption.
 * This mirrors the `UserFont` struct in `src-tauri/src/fonts.rs`.
 */
export interface UserFont {
    /** The name of the font, derived from its filename (e.g., "FiraCode-Regular"). */
    name: string;
    /** The absolute path to the font file. */
    path: string;
}

/**
 * Payload received from the backend 'index-updated' event.
 * Mirrors `IndexUpdatePayload` in `src-tauri/src/world.rs`.
 */
export interface IndexUpdatePayload {
    /** * Whether the file tree structure (folders/files added/removed) has changed.
     * If false, the frontend can skip reloading the heavy file tree.
     */
    structure_changed: boolean;
}
