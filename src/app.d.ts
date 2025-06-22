interface TauriCommands {
    get_file_content: (path: string) => Promise<string>;
    save_file: (path: string, content: string) => Promise<void>;
    create_directory: (path: string) => Promise<void>;
    list_directory: (path: string) => Promise<string[]>;
    get_tag_index: (tag: string) => Promise<string[]>;
    get_backlinks: (path: string) => Promise<string[]>;
    resolve_wikilink: (currentPath: string, link: string) => Promise<string>;
    get_image: (path: string) => Promise<number[]>;
}


declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T extends keyof TauriCommands>(
          cmd: T,
          args?: Parameters<TauriCommands[T]>[0]
        ) => Promise<ReturnType<TauriCommands[T]>>;
      };
    };
  }
}
