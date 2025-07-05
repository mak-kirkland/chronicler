/**
 * Extracts a display-friendly title from a file path.
 * It gets the last part of the path (the filename) and removes the .md extension if present.
 * @param path The full path to the file.
 * @returns A clean title string.
 */
export function getTitleFromPath(path: string): string {
    const fileName = path.split(/[\\/]/).pop() || 'Untitled';
    // Use a regex to remove the .md extension only if it's at the end of the string.
    return fileName.replace(/\.md$/, '');
}
