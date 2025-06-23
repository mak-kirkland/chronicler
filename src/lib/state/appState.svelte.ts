import { getFileContent, saveFile, listDirectory } from '../utils/tauri';
import type { FileIndex, ParsedMarkdown, WorldState } from '../types';

/**
 * Build file index recursively from directory structure
 */
async function buildFileIndex(path: string = ''): Promise<FileIndex[]> {
    try {
        const items = await listDirectory(path);

        const results = await Promise.all(
            items.map(async (itemName): Promise<FileIndex> => {
                const fullPath = path ? `${path}/${itemName}` : itemName;

                // Simple heuristic: if no extension, it's probably a directory
                const isDirectory = !itemName.includes('.');

                const item: FileIndex = {
                    path: fullPath,
                    name: itemName,
                    isDirectory,
                };

                // Recursively load children for directories
                if (isDirectory) {
                    try {
                        item.children = await buildFileIndex(fullPath);
                    } catch (error) {
                        console.warn(`Could not load children for ${fullPath}:`, error);
                        item.children = [];
                    }
                }

                return item;
            })
        );

        // Sort: directories first, then files, both alphabetically
        return results.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
    } catch (error) {
        console.error(`Failed to build file index for "${path}":`, error);
        return [];
    }
}

/**
 * Central application state using Svelte 5 runes
 */
export const appState = $state<WorldState & {
    // Current editor state
    activePath: string | null;
    activeContent: string;
    parsedContent: ParsedMarkdown | null;
    showPreview: boolean;

    // UI state
    isSaving: boolean;
    saveStatus: string;

    // Methods
    init(): Promise<void>;
    refresh(): Promise<void>;
    loadFile(path: string): Promise<void>;
    saveCurrentFile(): Promise<void>;
    createNewFile(path: string): Promise<void>;
    togglePreview(): void;
    setActiveFile(path: string): void;
}>({
    // World state
    worldRoot: '',
    fileIndex: [],
    tagIndex: {},
    isLoading: true,
    error: null,

    // Editor state
    activePath: null,
    activeContent: '',
    parsedContent: null,
    showPreview: false,

    // UI state
    isSaving: false,
    saveStatus: '',

    /**
     * Initialize the application state
     */
    async init() {
        try {
            this.isLoading = true;
            this.error = null;

            // Load initial directory structure
            this.fileIndex = await buildFileIndex('');

            console.log('App state initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app state:', error);
            this.error = `Failed to initialize: ${error}`;
        } finally {
            this.isLoading = false;
        }
    },

    /**
     * Refresh the file index
     */
    async refresh() {
        try {
            this.fileIndex = await buildFileIndex('');
        } catch (error) {
            console.error('Failed to refresh file index:', error);
            this.error = `Failed to refresh: ${error}`;
        }
    },

    /**
     * Load a file into the editor
     */
    async loadFile(path: string) {
        try {
            const parsed = await getFileContent(path);

            this.activePath = path;
            this.activeContent = parsed.clean_md;
            this.parsedContent = parsed;
            this.saveStatus = '';

            console.log(`Loaded file: ${path}`);
        } catch (error) {
            console.error(`Failed to load file "${path}":`, error);
            this.error = `Failed to load file: ${error}`;
        }
    },

    /**
     * Save the current file
     */
    async saveCurrentFile() {
        if (!this.activePath) {
            console.warn('No active file to save');
            return;
        }

        try {
            this.isSaving = true;
            this.saveStatus = 'Saving...';

            await saveFile(this.activePath, this.activeContent);

            this.saveStatus = 'Saved!';

            // Clear status after 2 seconds
            setTimeout(() => {
                this.saveStatus = '';
            }, 2000);

        } catch (error) {
            console.error('Failed to save file:', error);
            this.saveStatus = `Save failed: ${error}`;
        } finally {
            this.isSaving = false;
        }
    },

    /**
     * Create a new file
     */
    async createNewFile(path: string) {
        try {
            // Create with minimal content
            const initialContent = `# ${path.split('/').pop()?.replace('.md', '') || 'New File'}\n\n`;

            await saveFile(path, initialContent);
            await this.refresh();
            await this.loadFile(path);

        } catch (error) {
            console.error(`Failed to create file "${path}":`, error);
            this.error = `Failed to create file: ${error}`;
        }
    },

    /**
     * Toggle preview pane
     */
    togglePreview() {
        this.showPreview = !this.showPreview;
    },

    /**
     * Set active file (for file explorer)
     */
    setActiveFile(path: string) {
        this.loadFile(path);
    }
});
