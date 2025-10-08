# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [v0.26.1-alpha] - 2025-10-08

### 🔄 Changed

- **Renderer**: The HTML sanitizer has been updated to permit additional safe attributes for styling tables. You can now use `border` and `align` on `<table>` tags, and `valign` on `<th>` and `<td>` tags to create basic table layouts and control vertical alignment in cells.

### 🐞 Fixed

- **Templates**: Fixed an issue in the template editor where long templates could not be scrolled. The wrapper now correctly allows vertical scrolling when the content exceeds the container's height.

---

## [v0.26.0-alpha] - 2025-10-06

### ✨ Added

- **Reports**: A new "Parse Errors" report has been added to provide a centralized view of all files that contain malformed YAML frontmatter or other parse errors. The backend now tracks these files and their specific error messages in real-time. The new report view allows you to click on any file to navigate directly to it to fix the issue.
- **Logging**: A file-based logging system has been implemented to aid in debugging and user support. Logs are now written to the standard application log directory, with a new file created daily (e.g., `chronicler.YYYY-MM-DD.log`). A new link has been added to the footer of the Settings modal that allows you to easily open the log directory from within the application.

### 🔄 Changed

- **Help**: The Help guide was rewritten and restructured into a three-part guide (Essentials, Customization, Advanced), simplifying technical language and improving readability.

### 🐞 Fixed

- **Indexer**: Fixed a critical bug where saving a file with invalid YAML frontmatter would cause it to be completely removed from the index, leading to a misleading "File not found" error. If parsing fails on an update, the indexer now creates a default "placeholder" page object to ensure the file remains accessible in the application.

---

## [v0.25.0-alpha] - 2025-10-01

### ✨ Added

- **Infobox**: You can now create highly customizable, wiki-style infobox layouts directly from the YAML frontmatter.A new `layout` key allows you to inject `header` rules to add centered titles and `group` rules to render multiple fields as columns. Rules can be positioned relative to existing fields (e.g., `{ "above": "field_name" }`).

---

## [v0.24.4-alpha] - 2025-09-29

### 🐞 Fixed

- **Images**: Fixed a bug that prevented images embedded as Base64 `data:` URIs from rendering, which broke the full-screen image viewer. This was caused by the `data:` source being accidentally removed from the Content Security Policy's `img-src` directive during a recent refactor.

---

## [v0.24.3-alpha] - 2025-09-27

### 🐞 Fixed

- **Fonts / Windows**: Fixed an issue that prevented custom fonts from rendering correctly on Windows 11. This was because the font's filename was being used as its CSS `font-family`, which stricter browser engines reject if it doesn't match the font's internal metadata. The application now extracts the correct "Font Family Name" from the file's metadata, ensuring fonts are applied reliably across all platforms.

---

## [v0.24.2-alpha] - 2025-09-25

### 🐞 Fixed

- **Importer**: Fixed an issue where the MediaWiki importer would fail with a "program not found" error. The importer now correctly locates and uses the application-managed Pandoc executable instead of attempting to call a globally installed version.

---

## [v0.24.1-alpha] - 2025-09-24

### 🐞 Fixed

- **Windows / New Page**: Fixed a bug on Windows where the "New Page" modal failed to pre-select the correct parent directory due to inconsistent path separators.

---

## [v0.24.0-alpha] - 2025-09-24

### ✨ Added

- **Fonts**: You can now add and use your own custom fonts in themes. The application will automatically scan a new `fonts` directory in the app's configuration folder on startup. Supported formats are `.woff2`, `.ttf`, and `.otf`.

### 🔄 Changed

- **File View**: The main view will now remain focused on a file after it has been renamed or moved. Previously, these actions required you to manually locate and re-open the file.
- **Reports**: The "Broken Links" report now uses natural sort order instead of alphabetical. This ensures that numbered items (e.g., "1st Scion", "18th Scion") are sorted correctly and intuitively.
- **Internal**: The frontend's view navigation logic has been centralized, removing duplicated local functions.

---

## [v0.23.4-alpha] - 2025-09-23

### 🔄 Changed

- **Performance / Images**: The high-performance hybrid image loading system has been re-instated. This system significantly improves performance and reduces memory usage by loading in-vault images asynchronously via a custom asset protocol, while retaining Base64 encoding for external images.

### 🐞 Fixed

- **Windows**: Fixed a critical bug that prevented in-vault images from loading on Windows with the new asset protocol. This was caused by a difference in how webview engines handle custom protocols. The backend now uses conditional compilation to generate the correct URL format for each platform, making the performance improvements fully cross-platform.

---

## [v0.23.3-alpha] - 2025-09-22

### 🐞 Fixed

- **Images**: Fixed a critical regression where images stopped loading after the recent change in `v0.23.2`. This reverts image handling back to the previous behaviour.

---

## [v0.23.2-alpha] - 2025-09-22

### 🔄 Changed

- **Performance**: Implemented a new hybrid image loading strategy to resolve critical performance bottlenecks and UI freezes caused by the previous all-Base64 approach. Images located inside the vault (using relative paths) are now loaded via Tauri's highly performant `asset://` protocol, which loads them asynchronously to prevent UI freezes and reduce memory usage.

### 🐞 Fixed

- **Styling**: Fixed an issue where inline images in the infobox were not styled correctly. A consistent CSS class (`embedded-image`) is now applied to all `<img>` tags during rendering, regardless of their source, and the infobox styles have been updated to account for this.

---

## [v0.23.1-alpha] - 2025-09-22

### 🐞 Fixed

- **Infobox**: Fixed a regression that caused fields in the infobox to be rendered in an unpredictable order, which often resulted in the last field from the YAML appearing first in the UI.

---

## [v0.23.0-alpha] - 2025-09-21

### ✨ Added

- **Infobox**: An image carousel has been implemented for the infobox. The `image` field in the YAML frontmatter now accepts a list of image paths in addition to a single string.
- **View Modes**: A new "editor-only" view mode has been added.

### 🔄 Changed

- **Infobox**: The component's styling has been refactored to use modern CSS best practices. All hardcoded `px` values have been replaced with relative `rem` units, making the component fully scalable and accessible. CSS Custom Properties have also been introduced to create a consistent design system for spacing and sizing.

### 🐞 Fixed

- **UI**: Fixed an issue that caused a flash of the default light theme on application startup and when the vault selector was open.

---

## [v0.22.2-alpha] - 2025-09-21

### 🐞 Fixed

- **Windows**: Fixed a bug that prevented wikilinks from navigating correctly on Windows due to inconsistent path separators. The HTML renderer had not been updated to account for an earlier change that standardized path serialization to a web-standard format. A new helper function has been added to centralize path normalization, guaranteeing all paths sent to the frontend use the web-standard format.

---

## [v0.22.1-alpha] - 2025-09-20

### 🐞 Fixed

- **Windows**: Fixed a critical bug that caused navigation to fail when creating new pages in subfolders. The issue stemmed from the backend sending paths with inconsistent separators (`\` vs. `/`) due to a subtle behavior in Tauri's serialization layer. A custom serializer has been implemented to guarantee that all paths sent to the frontend are consistently formatted with forward slashes.

---

## [v0.22.0-alpha] - 2025-09-18

### ✨ Added

- **Infobox**: You can now use inline Markdown formatting (like bold and italics) in any string value within the YAML frontmatter.
- **Infobox**: Images can now be embedded directly into frontmatter fields using either standard `<img>` tags or wikilink syntax (`![[...]]`). These images are converted to Base64 data URLs and styled to display correctly within the infobox.

### 🔄 Changed

- **Infobox**: The default italic styling has been removed from the infobox subtitle. This change allows users to apply their own formatting now that Markdown is supported.
- **Internal**: The backend rendering pipeline has been refactored to improve maintainability. All frontmatter processing logic—including sanitation, field rendering, and image handling—has been encapsulated into a single `process_frontmatter` function.

---

## [v0.21.1-alpha] - 2025-09-17

### 🔄 Changed

- **Help**: The Help page has been updated with new sections covering horizontal separators (`---`), embedding images using both Markdown and wikilink syntax, and using YAML block scalars (`|`).

### 🐞 Fixed

- **Preview**: Fixed a bug that prevented creating new pages by clicking on broken links in the preview pane. A previous bad cherry-pick had caused the HTML sanitizer to incorrectly strip the necessary `data-target` attribute from links.

---

## [v0.21.0-alpha] - 2025-09-16

### ✨ Added

- **Infobox**: A new `subtitle` field is now supported in the YAML frontmatter. It is rendered directly below the main title in italics.

### 🔄 Changed

- **Table of Contents**: A new "Contents" button has been added to the header of the main view, allowing you to toggle the visibility of the Table of Contents globally.
- **Help**: The Help page has been updated with a new section for using inline images, such as flags or icons, and also mentions the new 'subtitle' YAML field.

### 🐞 Fixed

- **File Explorer**: The file and folder sorting has been changed from standard alphabetical to natural sort order. This corrects an issue where numbered files were sorted unintuitively (e.g., `100` appearing before `21`) and ensures all entries are now listed in a more human-friendly order.

---

## [v0.20.0-alpha] - 2025-09-13

### ✨ Added

- **Importer**: Added a new importer for MediaWiki XML dumps, which is now available as an option in the Importer modal. It uses a robust two-pass process to accurately parse pages and infer tags from infobox templates by mapping template categories. The importer automatically downloads all images referenced in the content from the live wiki's API, flattens infobox data into YAML frontmatter, and converts wikitext to Markdown with `[[wikilinks]]`.
- **Images**: You can now embed images using the popular wikilink syntax (`![[image.jpg]]`). The renderer converts this into a standard `<img>` tag and processes it through the same consistent pipeline as other images.

### 🐞 Fixed

- **Table of Contents**: Corrected the rendering of headers that contain wikilinks. The TOC will now display the clean alias or page name (e.g., "Display Text") instead of the raw Markdown (`[[My Page|Display Text]]`). The anchor link URLs are also now generated from this cleaned text for more readable links.

---

## [v0.19.1-alpha] - 2025-09-11

### 🔄 Changed

- **Performance**: Significantly improved performance of batch file operations, such as adding multiple files to the vault at once. Previously, the application would trigger a full, expensive re-indexing for each individual file change. The file watcher now collects multiple events into a single batch, and the expensive relationship-rebuilding step is performed only once after all changes have been processed.

---

## [v0.19.0-alpha] - 2025-09-09

### ✨ Added

- **New Page Workflow**: The "New Page" modal has been enhanced with a dropdown menu that lists all available folders within the vault. This allows you to select a destination for the new page directly from the modal.

### 🐞 Fixed

- **Renderer**: Wikilinks located inside raw HTML blocks (e.g., within `<table>` tags) are now correctly processed and rendered as clickable links. Previously, they were passed through as plain text.
- **Parser**: Corrected an issue where wikilinks with aliases used inside Markdown tables were not parsed correctly. The parser now properly handles the necessary escaped pipe character (`\|`), which is required to prevent conflicts with table syntax.
- **UI**: Fixed a minor layout issue that could cause an unnecessary horizontal scrollbar to appear in the text input modal.

---

## [v0.18.2-alpha] - 2025-09-07

### 🐞 Fixed

- **Styling**: Fixed a layout regression where main page content would incorrectly appear below the infobox instead of wrapping around it. This was resolved by adding a new wrapper element that correctly contains the flow of the main content while allowing headings inside it to clear floats as intended.

---

## [v0.18.1-alpha] - 2025-09-06

### ✨ Added

- **Infobox**: The page title is now displayed at the top of the infobox.

### 🔄 Changed

- **UI**: The application icons have been updated with the new Chronicler logo.
- **Styling**: The width of tables in the preview area is now set to `auto` to better fit their content.

### 🐞 Fixed

- **Images**: Fixed a bug that prevented images from rendering if their file paths contained special characters (like `&`) or URL-encoded characters (like `%20` for a space). The renderer now correctly decodes these paths, making image handling significantly more reliable.
- **Preview**: Resolved a critical issue where clicking a broke Markdown link (e.g., `[link](Target)`) would cause an unrecoverable 404 error, breaking the page view. All click events are now handled by a unified system that neutralizes such links to prevent the error.
- **Styling**: Corrected a layout bug where headings would incorrectly wrap around floated images from a previous section. Headings now automatically clear preceding floats, ensuring a predictable document structure.

---

## [v0.18.0-alpha] - 2025-09-05

### ✨ Added

- **Importer**: You can now import an entire folder of `.docx` files at once.
- **Importer**: When converting `.docx` files, any embedded images are now automatically extracted and saved into a dedicated `images` directory. The resulting Markdown files will correctly link to these images using clean, relative paths.
- **Importer**: The import UI has been moved from the general settings into a new, dedicated modal. This new interface provides better user feedback by displaying a loading message while the import is in progress.

---

## [v0.17.1-alpha] - 2025-09-03

### 🔒 Security

- **Security**: All values within the YAML frontmatter are now sanitized before rendering. This prevents malicious HTML, like `onerror` attributes, from being injected and executed in the infobox, protecting against Cross-Site Scripting (XSS) attacks.

### 🐞 Fixed

- **Preview**: Fixed a bug where the page title would display a link's alias instead of the actual page name when navigating via internal links. Page titles are now correctly derived from the file path.

---

## [v0.17.0-alpha] - 2025-09-02

### ✨ Added

- **Preview**: An automatic Table of Contents (ToC) is now generated for pages that contain Markdown headers, making it easier to navigate long documents. The ToC comes with a `[hide]` button, and Chronicler remembers your choice.

### 🔄 Changed

- **UI**: Modals now have a maximum height to prevent them from overflowing the viewport and will display a vertical scrollbar when their content is too long.
- **Writer**: The logic for writing page content to disk has been centralized into the application's `writer` module to ensure all saves are atomic operations. This improves data integrity by preventing corruption or data loss if an operation is interrupted.
- **Renderer**: The HTML sanitizer has been configured to no longer automatically add `rel="noopener noreferrer"` to external links. This change was implemented to resolve internal test failures and results in cleaner HTML output.
- **Help**: The Help page has been updated with a new section explaining how to create tables using Markdown syntax.

---

## [v0.16.1-alpha] - 2025-08-31

### 🐞 Fixed

- **Parser**: Fixed the wikilink parser which was incorrectly allowing multiple `#` characters in a link, such as `[[Page#Section1#SubSection]]`. The logic has been updated to enforce a stricter syntax, ensuring that malformed links with multiple section markers are now treated as plain text.
- **Parser**: Resolved an issue where wikilinks with extra whitespace around the alias pipe character (e.g., `[[link | alias]]`) were incorrectly flagged as broken. The parser now trims leading and trailing whitespace from the link target and alias, making it more permissive of common user formatting and improving the accuracy of link resolution.

---

## [v0.16.0-alpha] - 2025-08-30

### ✨ Added

- **Preview**: You can now create a missing page by clicking its "broken" wikilink directly in the preview pane.
- **Reports**: Added a new "Reports" tab to the sidebar to house vault analytics.
- **Reports**: Implemented a "Broken Links" report that lists all unresolved wikilinks and the source pages they appear on, allowing you to click on the broken link's target to create the missing page.

### 🔄 Changed

- **Internal**: The frontend logic for rendering the main view (e.g., file view, reports) has been refactored to a more scalable and modern component map system.
- **Internal**: As part of the view rendering refactor, the welcome screen has been extracted into its own dedicated `WelcomeView.svelte` component.
- **Internal**: The modal management system has been modernized, improving code clarity.

---

## [v0.15.0-alpha] - 2025-08-28

### ✨ Added

- **Templates**: Added a system for creating, managing, and using user-defined page templates. These templates are stored in a global configuration directory, making them accessible across all vaults.

### 🔄 Changed

- **New Page Workflow**: The "New Page" workflow has been updated with a new dropdown menu. This menu is populated with your saved templates, allowing you to start a new page with pre-defined content.

---

## [v0.14.3-alpha] - 2025-08-24

### 🔄 Changed

- **Build**: Optimized the backend's dependencies. Default features for several dependencies were disabled in favor of an opt-in approach, ensuring only necessary and cross-platform compatible code is compiled. This speeds up build time, reduces the final binary size and improves build reliability.
- **Images**: Restored support for SVG images.

---

## [v0.14.2-alpha] - 2025-08-23

### 🐞 Fixed

- **Renderer**: Fixed a bug where certain Markdown-generated HTML (e.g horizontal lines via `***`) was being removed due to overly restrictive sanitization. The sanitizer whitelist has been extended to include formats that were previously working.

---

## [v0.14.1-alpha] - 2025-08-23

### 🐞 Fixed

- **Renderer**: Fixed a critical bug where internal page links were broken, attempting to open external URLs instead of navigating to the linked page.

---

## [v0.14.0-alpha] - 2025-08-23

### ✨ Added

- **Explorer**: You can now duplicate any page from the file explorer's context menu. A copy is created in the same directory with a numerical suffix.
- **Images**: Added the ability to embed images directly in the body of a page using standard HTML `<img>` tags. The renderer automatically converts the `src` paths of these images into self-contained Base64 data URLs.

### 🐞 Fixed

- **Nag Screen**: Corrected the URL for the donation link in the license nag screen.

### 🔒 Security

- **Security**: Implemented an HTML sanitizer to prevent Cross-Site Scripting (XSS) attacks from user-provided content. The renderer now strips dangerous tags (like `<script>`) and attributes (like `onerror`) while allowing a whitelist of safe elements.
- **Security**: Removed support for SVG images to mitigate a potential XSS vulnerabilities. Because SVGs can contain embedded `<script>` tags, this change hardens application security by disallowing the format in favor of safer raster image types.

### 🔄 Changed

- **Infobox**: Images can now be viewed full-screen with a single click instead of a double click.
- **Help**: The Help page has been updated with a new section for the spoiler syntax and examples for embedding and styling images using HTML.

---

## [v0.13.0-alpha] - 2025-08-21

### ✨ Added

- **Spoilers**: Added support for Discord-style `||spoiler||` syntax in Markdown.
- **License Nag Screen**: Implemented a modal to encourage unlicensed users to purchase a license after 30 days of use.

### 🔄 Changed

- **Styling**: The CSS rules for internal wikilinks have been consolidated from individual components into the global `app.css` file.
- **Internal**: The backend rendering logic for custom syntax has been refactored to improve maintainability.

---

## [v0.12.0-alpha] - 2025-08-19

### ✨ Added

- **Infobox**: You can now double-click the image within a page's infobox to open it in the full-screen image viewer.

### 🐞 Fixed

- **Fonts**: Updated the "Cinzel" font file to a version that includes the full Greek character set, fixing a rendering bug where the mu character (μ) would not display correctly.
- **Explorer**: Added checks to avoid unnecessary error popups when attempting to move a file or folder into the folder it's already in.

### 🔄 Changed

- **Infobox**: Fields in the infobox are now displayed in the same order they are defined in the YAML frontmatter, rather than being sorted alphabetically.

### 🔒 Security

- **Images**: The method for displaying images has been completely refactored for better performance and security. All image processing is now handled by the Rust backend, which reads image files and embeds them as Base64 Data URLs.

---

## [v0.11.1-alpha] - 2025-08-17

### ✨ Added

- **Image View**: Navigation controls have been added to the Image View.  A new reusable `ViewHeader.svelte` component has been created to unify the header structure across the application. Previously, header logic was duplicated in `FileView` and `TagIndexView` but was absent in `ImageView`.

### 🔄 Changed

- **Preview**: The preview area has been refactored to allow page content to wrap around the infobox for a more fluid reading experience.
- **File View**: Simplified infobox logic. The `FileView` component now passes the frontmatter object directly, and the `Infobox` component itself determines whether it should render.
- **Donations**: The Patreon and Buy Me a Coffee links in the welcome footer have been replaced with a single, consolidated link to the support section of chronicler.pro.

---

## [v0.11.0-alpha] - 2025-08-15

### ✨ Added

- **Licensing**: A complete backend system has been implemented for validating and managing user licenses via the Keygen.sh API.

### 🔄 Changed

- **Donation Prompt**: The donation prompt logic has been refactored to no longer show for users with an active license, providing a better user experience for supporters.

---

## [v0.10.4-alpha] - 2025-08-14

### 🐞 Fixed

- **Writer**: Fixed a data consistency issue where renaming a file externally (e.g., in the system's file explorer) would not update its backlinks, leading to a broken link graph. Previously, only renames initiated from within the application would trigger backlink updates. The backlink logic has now been centralized into a single transactional function that handles renames from both the file watcher and internal app operations.

### 🔄 Changed

- **Writer**: Periods are now allowed in filenames. Previously, the application would interpret the last period as the start of a file extension, causing a name like "api.v1" to be saved as "api.md". The path construction logic has been changed to ensure that periods in user-provided names are preserved.

---

## [v0.10.3-alpha] - 2025-08-13

### 🐞 Fixed

- **Writer**: Fixed a regression where renaming a page would incorrectly add a pipe separator (`|`) to wikilinks that did not have an alias. This would cause a link like `[[old-name]]` to be changed to `[[new-name|]]`. The logic now correctly handles both aliased and non-aliased links, preserving their original structure.

---

## [v0.10.2-alpha] - 2025-08-12

### 🐞 Fixed

-   **Linux**: Resolved a critical crash when launching the AppImage on Wayland-based systems (e.g., Arch Linux, Steam Deck). The build configuration has been adjusted to prevent bundling a conflicting media framework library.

---

## [v0.10.1-alpha] - 2025-08-12

### 🐞 Fixed

- **Writer**: Fixed a critical bug where renaming a page would corrupt any backlinks that used an alias. The update logic now correctly preserves the `|` separator, ensuring that links with custom display text (e.g., `[[new-page|display text]]`) are formatted correctly after a rename.

---

## [v0.10.0-alpha] - 2025-08-11

### ✨ Added

- **Settings**: Implemented a new hybrid settings model that distinguishes between global and per-vault configurations. Custom themes are stored globally, allowing them to be used across all vaults. Vault-specific settings like the active theme, font size, and sidebar width are stored in a new settings file within each vault, making them self-contained and portable.
- **Theme Editor**: The theme editor has been enhanced to allow for font selection. You can now choose separate fonts for headings and body text from a dropdown menu, and the changes are applied in a live preview.

---

## [v0.9.5-alpha] - 2025-08-10

### 🐞 Fixed

- **Explorer**: Resolved a layout issue where the file explorer's scrollbar was not flush with the edge of the sidebar.
- **Explorer**: Fixed a bug that caused inconsistent text alignment for long file and directory names that wrapped to a new line.
- **Explorer**: Corrected an issue where file and folder names could be truncated prematurely because hidden action buttons were still occupying space.

### 🔄 Changed

- **Sidebar**: The width of the sidebar is now a persistent setting that will be remembered across application sessions.
- **Settings**: The system for saving settings to disk has been refactored to be automatic and debounced. This improves performance and responsiveness by bundling multiple quick changes (e.g., from a slider) into a single write operation.

---

## [v0.9.4-alpha] - 2025-08-08

### 🐞 Fixed

- **Pandoc**: Corrected the logic for locating the Pandoc executable on macOS by simplifying the search pattern.

### 🔄 Changed

- **Themes**: Centralized the list of CSS variables that define a theme's color palette into a single source of truth. The theme editor's UI is now dynam
ically generated from this central list.
- **Themes**: Refactored the internal theme data structures to derive the `ThemePalette` type directly from the canonical list of theme keys, improving type safety and reducing redundancy.
- **Themes**: Simplified the internal function for setting the active theme.

---

## [v0.9.3-alpha] - 2025-08-06

### ✨ Added

- **Theme Editor**: Implemented a live preview feature. The entire application UI now updates in real-time as you edit a theme's colors.
- **Theme Editor**: The theme list now displays a user-friendly message when no custom themes have been created yet.

### 🐞 Fixed

- **Theme Editor**: Fixed a critical bug where applying a theme would incorrectly overwrite other global styles, such as the user's selected font size.
- **Theme Editor**: Deleting a theme now uses an asynchronous confirmation dialog, preventing the theme from being deleted accidentally if the user cancelled the action.
- **Theme Editor**: Resolved an issue where lingering CSS variables from a custom theme were not being properly cleaned up when switching back to a built-in theme.
- **Theme Editor**: Fixed a layout bug where the theme name input field could overflow its container and cause a horizontal scrollbar.

### 🔄 Changed

- **Core**: The title field in a page's YAML frontmatter has been restored, reverting its deprecation in `v0.9.2-alpha`.
- **Theme Editor**: The user experience has been significantly improved with several UX enhancements.
- **State Management**: The application's global style and theme management has been overhauled to be more robust and performant, resolving several state synchronization bugs.

---

## [v0.9.2-alpha] - 2025-08-06

### 🐞 Fixed

- **Config**: Fixed an issue where images and other assets would not load if they were located outside of the user's home directory.
- **Modals**: Fixed a bug where submitting the text input modal would attempt to close it twice.
- **Accessibility**: Resolved accessibility warnings to improve usability for screen reader users. This includes adding a semantic `role` to the file explorer and providing more descriptive alt text for images in the infobox.
- **Sidebar**: Removed unnecessary code related to the "Change Vault" functionality in the settings
- **Warnings**: Cleaned up the codebase by removing unused imports to fix TypeScript compiler warnings.

### 🔄 Changed

- **Core**: The filename is now the single source of truth for a page's title. The `title` field in YAML frontmatter has been deprecated and is no longer used.
- **State Management**: The application's core lifecycle state (e.g., loading, ready) has been separated from UI state for improved maintainability and a clearer separation of concerns.

## [v0.9.1-alpha] - 2025-08-04

### ✨ Added

- **Themes**: Added a new built-in "Professional" theme.

### 🐞 Fixed

- **CSS**: Corrected the fallback CSS for several themes that were using incorrect generic font family fallbacks (e.g., specifying 'serif' for a sans-serif font).
- **Theme Editor**: Addressed multiple TypeScript warnings within the theme editor to improve type safety. This includes resolving issues with implicitly typed variables and refining null-checking logic.
- **Preview**: Resolved a layout bug where preformatted content, such as indented code blocks, could overflow and break the page layout. The preview area was refactored to correctly isolate the scrolling content.

### 🔄 Changed

- **Themes**: The "hologram" theme has been improved to use a proper italic font file instead of relying on the browser to synthetically slant the regular font.
- **Startup**: The application's startup process and state management have been overhauled to be more robust, predictable, and maintainable. All initialization logic is now centralized in a single module, and the sequence is guaranteed to prevent race conditions.
- **State Management**: The application's status store was improved from a simple string to an object, allowing for more detailed error messages to be displayed in the UI.
- **Help**: The "Help" page was updated to include the special behaviour of the "infobox" field in the YAML frontmatter, that specifies the header text of the infobox.

---

## [v0.9.0-alpha] - 2025-08-04

### ✨ Added

- **Theme Editor**: Implemented a user-defined theme editor. You can now create, edit, save, and delete an unlimited number of custom themes, all of which are persisted between sessions.
- **Themes**: A new slider has been added to the Settings modal, allowing users to adjust the application's base font size for better readability.

---

## [v0.8.2-alpha] - 2025-08-03

### 🐞 Fixed

- **Writer**: Fixed a critical bug where renaming a file could lead to an invalid path in the indexer. The rename handler now correctly differentiates between file and folder operations to ensure path integrity.
- **Writer**: Improved the stability of file renames by making the entire operation, including all backlink updates, fully transactional. This prevents the vault from entering an inconsistent state if an update is interrupted.
- **Writer**: Renaming files with non-markdown extensions (e.g., `.jpg`, `.png`) now correctly preserves their original file extension instead of incorrectly changing it to `.md`.
- **Infobox**: Improved image loading diagnostics. Error messages for failed images now include the specific URL that failed, making it easier to debug broken image links.
- **Resources**: Standardized error handling for bundled application resources to provide more helpful and actionable error messages.

---

## [v0.8.1-alpha] - 2025-08-02

### 🔄 Changed

- **Renderer**: Wikilink rendering has been overhauled for more intuitive, context-aware behavior. Links are now correctly processed inside block-level code (fenced and indented) but are ignored inside inline code snippets. This fixes a bug where links in code blocks were previously rendered incorrectly as literal html.
- **Styling**: The application's CSS color system has been refactored to use semantic variable names (e.g., `--color-background-primary` instead of `--parchment`), improving theme consistency and maintainability.

---

## [v0.8.0-alpha] - 2025-07-31

### ✨ Added

- **Themes**: A theme switcher has been implemented, allowing users to switch between multiple built-in themes ("Parchment & Wine", "Slate & Gold", etc.) from the Settings modal. The chosen theme is persisted across application sessions.

### 🔄 Changed

- **Styling**: The application's styling has been significantly refactored for consistency and scalability.
- **Preview**: The main content preview has been refactored to use a modern Flexbox layout, fixing a visual bug where heading borders would render underneath the infobox.

---

## [v0.7.0-alpha] - 2025-07-30

### ✨ Added

- **Context Menu**: Added a new "Open in Explorer" option to the context menu to allow users to open folders in the OS's default file manager.
- **Context Menu**: Right-clicking the empty space now shows context menu options for the vault root.

### 🔄 Changed

- **Context Menu**: The menu is now context-aware, hiding actions like "Rename" and "Delete" for the vault root. The underlying event handling was also refactored to be more robust and maintainable.
- **UI**: Standardized the appearance of buttons and error messages throughout the application by replacing custom styles with the unified Button and ErrorBox components for better consistency.

---

## [v0.6.1-alpha] - 2025-07-28

### 🐞 Fixed

- **Editor**: Fixed a bug where wikilink autocompletion was showing directories instead of Markdown files.

---

## [v0.6.0-alpha] - 2025-07-28

### ✨ Added

- **Image Viewer**: You can now click on image files in the file explorer to open them in a full-page viewer.
- **Changelog Modal**: A new "View Changelog" button in Settings opens a scrollable modal showing the full version history from `CHANGELOG.md`.

### 🔄 Changed

- **Image Errors**: Improved error handling when loading images in the infobox. If a referenced image is missing, users now see a helpful message instead of a generic "Can't load image".
- **File Tree**: The internal file model was refactored for type safety and clarity. Files now use a `FileType` enum (`Directory`, `Markdown`, `Image`) to distinguish between nodes in the tree. This improves rendering and sorting logic.
- **Sorting**: Custom sort order ensures that directories always appear above files in the file explorer.

---

## [v0.5.2-alpha] - 2025-07-27

### 🔄 Changed

- **Writer**: Implemented atomic file writes to prevent data corruption or loss during application crashes or power failures. This was achieved by writing changes to a temporary file before renaming it, which guarantees that an operation either completes successfully or not at all.
- **Help**: The Help page was re-written to be more user-friendly and provide additional information to new users. It was also refactored to load its content from a bundled application resource (`HELP.md`) rather than a static file.
- **Internal**: Various code style improvements, documentation updates, and refactoring were completed to improve maintainability and readability.

---

## [v0.5.1-alpha] - 2025-07-25

### 🐞 Fixed

- **Drag and Drop**: Fixed a critical bug that caused file and folder move operations to fail on Windows. Path construction logic is now handled exclusively by the backend to ensure cross-platform compatibility and reliable drag-and-drop functionality.

### 🔄 Changed

- **Performance**: Reworked the core state management to use granular locking instead of a single global lock. This significantly improves concurrency and UI responsiveness by allowing operations like rendering and file fetching to run in parallel without blocking each other.
- **Stability**: File rename and move operations are now fully transactional. A new backup-and-rollback strategy prevents data loss or vault corruption if an operation (like updating wikilinks) is interrupted.
- **Architecture**: The backend was refactored to improve separation of concerns. All file system write operations were moved from the `Indexer` into a new, dedicated `Writer` component, making the codebase more modular, testable, and maintainable.
- **Internal**: Refactored backend path handling to use idiomatic, safer methods from Rust's standard library instead of manual string manipulation.

---

## [v0.5.0-alpha] - 2025-07-24

### ✨ Added

- **Preview**: The infobox is now fully responsive, using a `clamp()`-based width to scale correctly on different screen resolutions.
- **Preview**: External URLs clicked within the preview now open in the user's default web browser for convenience.

### 🐞 Fixed

- **CI**: Fixed a shell parsing error in the release workflow that caused the Ubuntu build to fail when updating release notes.

### 🔄 Changed

- **Updater**: The changelog displayed in the update modal now uses the default monospace font for better visual consistency with the rest of the application.

---

## [v0.4.2-alpha] - 2025-07-24

### 🐞 Fixed

- **Editor**: Fixed wikilink autocompletion to append the correct number of closing square brackets.

---

## [v0.4.1-alpha] - 2025-07-23

### ✨ Added

- **Editor**: The editor is now automatically focused whenenever it's opened so the user can immediately start typing.

### 🐞 Fixed

- **Updater**: A summary of the latest changes is now properly displayed in the update modal.

### 🔄 Changed

- **Editor**: Refactored wikilink autocompletion logic to be simpler and more maintainable.

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
