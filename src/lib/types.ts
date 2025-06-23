// Shared TypeScript interfaces matching Rust backend

export interface FileIndex {
    path: string;
    name: string;
    isDirectory: boolean;
    children?: FileIndex[];
}

export interface ParsedMarkdown {
    html: string;
    frontmatter?: Record<string, string>;
    tags: string[];
    wikilinks: string[];
    clean_md: string;
}

export interface EditorState {
    activePath: string | null;
    content: string;
    parsed: ParsedMarkdown | null;
    showPreview: boolean;
}

export interface WorldState {
    worldRoot: string;
    fileIndex: FileIndex[];
    tagIndex: Record<string, string[]>;
    isLoading: boolean;
    error: string | null;
}
