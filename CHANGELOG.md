# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [v0.4.0-alpha] - 2025-07-22

### ✨ Added

- **Editor**: The editor has been replaced with CodeMirror 6, which enables link and tag autocompletions.

### 🐞 Fixed

- **Drag and Drop**: Disabled the operating system's native drag-and-drop to ensure the HTML5 drag-and-drop feature works correctly on Windows and MacOS.
- **Internal**: Updated Tauri and its dependencies, fixing a bug that prevented the changelog from being displayed in the update modal.

### 🔄 Changed

- **Internal**: Reduced log pollution by no longer logging full page content for the `write_page_content` trace, as the path is sufficient.

---

## [v0.3.2-alpha] - 2025-07-21

### ✨ Added

- **Welcome Page**: Added a link to join the community on Discord in the welcome screen's footer.

### 🐞 Fixed

- **Linux Build**: Fixed a critical issue that caused the Linux AppImage build to fail. This also resolves compatibility problems for some Linux distributions, making the application runnable for more users.

---

## [v0.3.1-alpha] - 2025-07-21

### 🔄 Changed

- **File Watcher**: The file watcher is now more comprehensive. It correctly interprets a "Move to Trash" operation as a deletion and handles the creation and deletion of entire folders more intelligently, ensuring the file index remains consistent.
- **Stability**: The core locking strategy for file operations was refactored to use top-level write locks, preventing potential deadlocks and race conditions under heavy use.
- **Internal**: The application's code structure was improved for better maintainability, which will speed up future development.

---

## [v0.3.0-alpha] - 2025-07-19

### ✨ Added

- **Updater**: The update notification modal now displays a formatted changelog with notes on the latest version.
- **Explorer**: File explorer search has been improved; directories now dynamically expand to show matching files, and the manual expansion state is remembered after a search is complete.
- **Sidebar**: The search term in the sidebar is now automatically cleared when switching between the "Files" and "Tags" tabs.

### 🔄 Changed

- **Internal**: All application capabilities have been refactored into a default.json file.

---

## [v0.2.0-alpha] - 2025-07-19

### ✨ Added

**Improved Drag-and-Drop Experience**:

- **Root Drop Zone**: A dedicated drop zone now appears at the top of the file explorer when dragging, allowing files and folders to be moved to the vault root in a clear and predictable way.
- **Auto-Scrolling**: The file explorer now automatically scrolls when you drag an item near the top or bottom edge, making it easy to drop files into folders that are currently out of view.

### 🔄 Changed

- **Refactored Drag-and-Drop Logic**: The internal code for drag-and-drop was refactored into reusable Svelte DOM actions (draggable and droppable), simplifying component logic and improving maintainability.

---

## [v0.1.10-alpha] - 2025-07-18

### ✨ Added

- **Drag-and-Drop support**: Enabled drag-and-drop functionality in the File Explorer, allowing you to move files and folders to new locations directly within the app.

---

## [v0.1.9-alpha] - 2025-07-17

### ✨ Added

- **Quick-Create Buttons**: Added hover-activated buttons to each directory in the file explorer, allowing for the quick creation of new pages and folders directly within that directory.

### 🔄 Changed

- **Improved Styling**: Further unified CSS styling by centralizing more colors and typography into global variables.

### 🐞 Fixed

- **Editor Reverted**: Temporarily reverted the editor from CodeMirror 6 back to a standard textarea. This was done to resolve critical bugs in the production build. The advanced editor with autocompletion will be re-introduced once the build issues are fully solved.
- **Build Stability**: Corrected the SvelteKit configuration to properly build for SPA (Single-Page Application) mode, which is essential for Tauri apps.

---

## [v0.1.8-alpha] - 2025-07-15

### ✨ Added

- **Editor Autocompletion**: The editor has been upgraded to CodeMirror 6 and now provides autocompletion suggestions for [[wikilinks]] and frontmatter tags: [].
- **Donation Prompt**: A modal will now appear on application close asking users to consider supporting development. This choice is saved persistently so it only appears once.

### 🔄 Changed

- **UI & Branding**: The application logo has been added to the welcome screen and vault selector for a more consistent brand identity.

### 🐞 Fixed

- **Frontmatter Rendering**: Fixed a bug where having duplicate keys in a page's frontmatter would prevent the page from rendering correctly.

---

## [v0.1.7-alpha] - 2025-07-13

### ✨ Added

- **Automatic Link Updating**: When you rename a file from within Chronicler, all wikilinks pointing to that file in your vault will now be updated automatically.

### 🔄 Changed

- **Improved Backlinks Panel**: Backlinks are now sorted alphabetically and display a reference count in parentheses if a page links to the current page more than once (e.g., `(3)`).
- **Version Display**: The current application version is now visible in the Settings modal and the update notification window.
- **Page Template**: The default template for new pages now uses a YAML array for tags, which is more user-friendly.
- **macOS Instructions**: The installation instructions for macOS users have been updated to be more robust.

---

## [v0.1.6-alpha] - 2025-07-12

### ✨ Added

- **View Navigation**: Added back and forward arrows to the main view, allowing for easy navigation through browsing history, similar to a web browser.
- **Backend Unit Tests**: Added unit tests for the backend rendering engine to ensure stability and prevent regressions.

### 🔄 Changed

- **File Explorer UI**: The file explorer has been improved to hide the redundant root folder and start with all sub-folders collapsed by default, providing a cleaner initial view.
- **Improved Documentation**: Added extensive documentation to both the frontend and backend codebases to improve clarity and maintainability.
- **Refactored Image Handling**: Simplified the logic for displaying infobox images by handling it directly in the frontend, making the code easier to follow.

---

## [v0.1.5-alpha] - 2025-07-10

### ✨ Added

- **Automatic Updates**: Chronicler now checks for updates when the application starts, allowing users to easily download and install the latest version.

### 🔄 Changed

- **Welcome Page**: Added a footer to the welcome page informing the user that Chronicler is still in early (but active) development, and providing links for those who wish to support the project either by donation, reporting bugs, or requesting features.

---

## [v0.1.4-alpha] - 2025-07-10

### ✨ Added

- **Help Page**:  Added a button that opens a help page with instructions on writing Markdown and YAML frontmatter. It explains how to format content, use tags, and create links between pages.

### 🔄 Changed

- **Infobox Location**: Moved the infobox into the Preview component. This simplifies the FileView and ensures the infobox scrolls naturally with the rest of the page.

### 🐞 Fixed

- **Malformed YAML**: Fixed an issue where invalid YAML frontmatter would cause the entire page to fail rendering.

---

## [v0.1.3-alpha] - 2025-07-09

### ✨ Added

- **Infobox Images**: The infobox can now display the image defined by the YAML frontmatter.

### 🔄 Changed

- **Dynamic Infobox Layout**: The infobox is now responsive and changes its position based on the context. It appears at the top of the page in split view and on the right-hand side in preview-only mode. The layout also adapts for screens narrower than 480px.
- **Simplified Tag Data**: Refactored tag data handling by updating the backend to return data in the desired format, and updating the frontend to consistently use the single unified tag store derived from the global world state.
- **Backlinks Sidebar**: The width of the backlinks sidebar has been reduced from 280px to 200px.
- **Editor Scrollbar**: The editor's scrollbar is now flush with the side of the window for a cleaner look.

---

## [v0.1.2-alpha] - 2025-07-08

### ✨ Added

- **Context Menus**: Right-click context menus have been added to the file tree, providing actions to create, rename, and delete files and folders.
- **Timestamp Display**: The user interface now displays the last modified timestamp for the currently viewed page.
- **"New Folder" Button**: Added a button to create a new folder directly in the vault's root.

### 🔄 Changed

- **Improved New Page Workflow**: Creating a new page now automatically opens it and focuses the editor, allowing you to start typing immediately.
- **Centralized Modal Logic**: The modal system was refactored to use a central store and a generic `TextInputModal`, simplifying the code and improving maintainability.
- **Removed Tailwind CSS**: All styling is now handled with plain, scoped CSS for a simpler and more lightweight frontend.
- **Sidebar Configuration**: The initial width of the sidebar is now a configurable setting.

### 🐞 Fixed

- **Empty Directory Display**: Fixed a bug where empty directories were not being displayed correctly in the file tree.

---

## [v0.1.1-alpha] - 2025-07-05

### ✨ Added

- **Importer for .docx Files**: Added the ability to import Microsoft Word documents, which are automatically converted to Markdown while preserving formatting.
- **Automatic Pandoc Installation**: The application can now check for and download the correct version of Pandoc on-demand to power the import functionality.
- **Accessibility Controls**: Added keyboard controls and improved focus management for modals, previews, and the resizable sidebar.

### 🔄 Changed

- **Centralized State Management**: Major refactor of the frontend state. A single `worldStore` now acts as the source of truth for files and tags, with other parts of the UI subscribing to it.
- **Abstracted Backend Commands**: All calls to the Rust backend were moved into a dedicated `commands.ts` file, creating a clean API layer for the frontend.
- **Bundled Fonts Locally**: Fonts are now included in the application binary instead of being fetched from the web, preventing a "flash of unstyled content" on startup.
- **Backend-driven Filename Sanitization**: The Rust backend is now solely responsible for removing the `.md` extension from filenames, simplifying frontend logic.

---

## [v0.1.0-alpha] - 2025-07-04

### ✨ Added

- **Initial Project Setup**: The Chronicler application was born! This initial version includes a Rust backend powered by Tauri 2.0 and a Svelte 5 frontend.
- **Full File System Indexing**: The application performs a full scan of the vault on startup, building an in-memory index of all pages, tags, and links.
- **Real-time File Watching**: The application watches the vault for file changes (creations, modifications, deletions, and renames) and updates the UI in real-time.
- **Backend Markdown Rendering**: A dedicated rendering engine was included to process Markdown and wikilinks into HTML on the backend.
- **Configurable Vault Path**: Added a settings dialog to allow users to select and change their vault directory.
- **File Explorer**: A file tree is displayed in the left sidebar to navigate the vault and open files.
- **File View**: Markdown editor and preview to change the content of a file and see the rendered output.
- **Backlinks and Tag Views**: Implemented a backlinks sidebar and a dedicated view to see all pages associated with a specific tag.
- **Search Functionality**: A search bar was added to the sidebar to filter both files and tags.
- **GitHub Actions Release Workflow**: A CI/CD pipeline was set up to automate the building and releasing of the application.
- **Custom Fonts and Styling**: The application was given its unique parchment and ink aesthetic with the "IM Fell English" and "Uncial Antiqua" fonts.
