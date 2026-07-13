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
export type FileType =
    | "Directory"
    | "Markdown"
    | "Image"
    | "Map"
    | "Canvas"
    | "Timeline"
    | "External";

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
 * A lightweight representation of a map, used for the "associated maps" list.
 */
export interface MapLink {
    /** The display title of the map. */
    title: string;
    /** The absolute path to the map file. */
    path: string;
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
 * render the main file view, including raw content, rendered HTML, backlinks,
 * and associated maps.
 */
export interface FullPageData {
    /** The raw, un-rendered Markdown content of the page. */
    raw_content: string;
    /** The rendered version of the page for display. */
    rendered_page: RenderedPage;
    /** A list of all pages that link to this page. */
    backlinks: Backlink[];
    /** A list of all maps that have pins or regions linking to this page. */
    associated_maps: MapLink[];
}

/**
 * Represents the structure of a validated license.
 * This mirrors the `License` struct in `src-tauri/src/licensing.rs`.
 */
export interface License {
    key: string;
    status: string;
    expiry: string | null;
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
    /** The font's display name, read from the OpenType `name` table when
     * possible (e.g. "Fira Code Regular") and falling back to the file stem
     * for unparseable formats like WOFF2. */
    name: string;
    /** The absolute path to the font file. */
    path: string;
}

/**
 * A user-defined CSS snippet file and its enabled state.
 * Mirrors `Snippet` in `src-tauri/src/models.rs`.
 */
export interface Snippet {
    /** The bare `.css` file name, e.g. "stat-blocks.css". */
    filename: string;
    /** Whether this snippet is currently applied to rendered notes. */
    enabled: boolean;
}

/**
 * Payload received from the backend 'index-updated' event.
 * Mirrors `IndexUpdatePayload` in `src-tauri/src/world.rs`.
 *
 * Each flag lets the store skip refetches whose data can't have changed.
 */
export interface IndexUpdatePayload {
    /** File tree structure changed (file/folder added, removed, or renamed). */
    structure_changed: boolean;
    /** A markdown page was created, modified, or removed. */
    pages_changed: boolean;
    /** An image file was added, renamed, or removed (not just content-modified). */
    media_changed: boolean;
}

/**
 * Result of importing an image into the vault.
 * Mirrors `ImportedImage` in `src-tauri/src/models.rs`.
 */
export interface ImportedImage {
    /** The final on-disk filename, e.g. "diagram-2.png". */
    filename: string;
    /** The vault-relative path, e.g. "images/diagram-2.png". */
    relative_path: string;
    /** True if an identical existing file was reused instead of writing a copy. */
    reused: boolean;
}
