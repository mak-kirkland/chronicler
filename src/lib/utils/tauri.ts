import { invoke } from '@tauri-apps/api/core';

// File operations
export const getFileContent = async (path: string): Promise<string> => {
  return await invoke('get_file_content', { path });
};

export const saveFile = async (path: string, content: string): Promise<void> => {
  return await invoke('save_file', { path, content });
};

// Directory operations
export const createDirectory = async (path: string): Promise<void> => {
  return await invoke('create_directory', { path });
};

export const listDirectory = async (path: string): Promise<string[]> => {
  return await invoke('list_directory', { path });
};

// Indexing operations
export const getTagIndex = async (tag: string): Promise<string[]> => {
  return await invoke('get_tag_index', { tag });
};

export const getBacklinks = async (path: string): Promise<string[]> => {
  return await invoke('get_backlinks', { path });
};

// Wikilink resolution
export const resolveWikilink = async (
  currentPath: string,
  link: string
): Promise<string> => {
  return await invoke('resolve_wikilink', { currentPath, link });
};

// Image handling
export const getImage = async (path: string): Promise<number[]> => {
  return await invoke('get_image', { path });
};
