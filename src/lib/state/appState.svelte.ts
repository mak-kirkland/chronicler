// Reactive application state
export const appState = $state({
    worldRoot: "",
    fileIndex: [] as FileIndex[],
    tagIndex: {} as Record<string, string[]>,
    isLoading: true,
    error: null as string | null,

    // Initialize state
    async init() {
        try {
            // Load initial directory structure
            this.fileIndex = await buildFileIndex("");
            this.isLoading = false;
        } catch (err) {
            this.error = `Failed to initialize: ${err}`;
        }
    },

    // Refresh file index
    async refresh() {
        this.fileIndex = await buildFileIndex("");
    }
});

// Build file index recursively
async function buildFileIndex(path: string): Promise<FileIndex[]> {
    const items = await listDirectory(path);
    return Promise.all(items.map(async (itemPath) => {
        const fullPath = path ? `${path}/${itemPath}` : itemPath;
        const isDirectory = !itemPath.includes(".");

        return {
            path: fullPath,
            name: itemPath.split("/").pop() || itemPath,
            isDirectory,
            children: isDirectory ? await buildFileIndex(fullPath) : undefined
        };
    }));
}
