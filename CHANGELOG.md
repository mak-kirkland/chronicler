# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.3](https://github.com/mak-kirkland/chronicler/compare/v0.1.2-alpha...v0.1.3) (2025-07-09)


### Features

* Display images in the infobox ([66244fd](https://github.com/mak-kirkland/chronicler/commit/66244fd15e213f52b4dc82b6e423922211e311a7))


### Bug Fixes

* Move import to correct file ([ad3ad00](https://github.com/mak-kirkland/chronicler/commit/ad3ad007ed816a267140889d1e3fd3734eacd7e4))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
