// Tauri command wrappers with proper error handling

import { invoke } from '@tauri-apps/api/core';

/**
 * Get file content and parse it as markdown
 * Returns JSON string that needs to be parsed
 */
export const getFileContent = async (path: string): Promise<ParsedMarkdown> => {
    try {
        const jsonStr = await invoke<string>('get_file_content', { path });
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error('Failed to get file content:', error);
        throw new Error(`Failed to load file: ${error}`);
    }
};

/**
 * Save content to a file
 */
export const saveFile = async (path: string, content: string): Promise<void> => {
    try {
        await invoke('save_file', { path, content });
    } catch (error) {
        console.error('Failed to save file:', error);
        throw new Error(`Failed to save file: ${error}`);
    }
};

/**
 * Create a new directory
 */
export const createDirectory = async (path: string): Promise<void> => {
    try {
        await invoke('create_directory', { path });
    } catch (error) {
        console.error('Failed to create directory:', error);
        throw new Error(`Failed to create directory: ${error}`);
    }
};

/**
 * List directory contents
 */
export const listDirectory = async (path: string): Promise<string[]> => {
    try {
        return await invoke('list_directory', { path });
    } catch (error) {
        console.error('Failed to list directory:', error);
        throw new Error(`Failed to list directory: ${error}`);
    }
};

/**
 * Get files with a specific tag
 */
export const getTagIndex = async (tag: string): Promise<string[]> => {
    try {
        return await invoke('get_tag_index', { tag });
    } catch (error) {
        console.error('Failed to get tag index:', error);
        throw new Error(`Failed to get tag index: ${error}`);
    }
};

/**
 * Get backlinks for a file
 */
export const getBacklinks = async (path: string): Promise<string[]> => {
    try {
        return await invoke('get_backlinks', { path });
    } catch (error) {
        console.error('Failed to get backlinks:', error);
        throw new Error(`Failed to get backlinks: ${error}`);
    }
};

/**
 * Resolve a wikilink to actual file path
 */
export const resolveWikilink = async (
    currentPath: string,
    link: string
): Promise<string> => {
    try {
        return await invoke('resolve_wikilink', {
            currentPath,
            link
        });
    } catch (error) {
        console.error('Failed to resolve wikilink:', error);
        throw new Error(`Failed to resolve wikilink "${link}": ${error}`);
    }
};

/**
 * Get image data as byte array
 */
export const getImage = async (path: string): Promise<number[]> => {
    try {
        return await invoke('get_image', { path });
    } catch (error) {
        console.error('Failed to get image:', error);
        throw new Error(`Failed to load image: ${error}`);
    }
};
