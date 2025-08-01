# 🧭 Chronicler

> **Your digital scriptorium – where knowledge links together.** 🧙‍♂️

[![Latest Release](https://img.shields.io/github/v/release/mak-kirkland/chronicler?label=release)](https://github.com/mak-kirkland/chronicler/releases/latest)
[![Changelog](https://img.shields.io/badge/changelog-md-green)](https://github.com/mak-kirkland/chronicler/blob/main/CHANGELOG.md)
[![Help](https://img.shields.io/badge/help-md-blue)](https://github.com/mak-kirkland/chronicler/blob/main/HELP.md)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**Chronicler** is a free desktop app for note-takers, storytellers, researchers, and creative minds. It saves your notes as plain Markdown files on your computer — no subscriptions, no logins, and no internet required. Your thoughts stay in your hands.

🎉 Download the [Latest Release](https://github.com/mak-kirkland/chronicler/releases/latest)!

❤️ [Support on Patreon](https://patreon.com/ChroniclerNotes) or [Buy Me a Coffee](https://buymeacoffee.com/chronicler) to help fund development.

💬 [Join us on Discord](https://discord.gg/cXJwcbe2b7)

**Chronicler** is developed by a single independent creator (hi, that’s me! 👋) working on the project full-time. I rely entirely on donations as my **only source of income**. Its continued development is made possible thanks to the generous support of the community.

---

<img width="948" height="493" alt="Wine" src="https://github.com/user-attachments/assets/e8704700-f4ae-4793-9b91-523e0c0dccf2" />

---

<img width="950" height="492" alt="Hologram" src="https://github.com/user-attachments/assets/3b31d808-4525-4347-874b-ee8f0a96584c" />

---

## ✨ Features (Planned & In Progress)

### ✍️ Writing & Markdown

-   Uses simple **Markdown files and folders**
-   Clean editor with **auto-save** and **live preview**

### 🔗 Linking & Organization

-   **Tags** with **hierarchies**
-   Internal **[[wikilinks]]** with autocomplete
-   **Backlinks** to trace relationships between ideas
-   Smart **auto-indexing** and **link updates** on rename

### 📇 Templates & Infoboxes

-   Add structure with optional **infoboxes** (e.g., people, places, topics)
-   Define your own reusable **templates**

### 🗂️ Hierarchies & Categorization

-   Access the same note through multiple paths (e.g., by tag, topic or filesystem location)
-   Smart indexing supports flexible organization

### 🖼️ Media Support

-   Embed local images via `![[images/file.jpg]]`
-   Drag-and-drop support

### 📥 Importing from Word

Chronicler supports importing `.docx` files directly, making it easy to bring your existing notes into the app.

-   Converts Word formatting into clean **Markdown**
-   Preserves headings, lists, bold/italic text, and links
-   Works great for writers and worldbuilders migrating old content
-   Once imported, content is fully editable and linkable like any other page

### 🔐 Private & Offline

-   100% offline — **no cloud**, no vendor lock-in
-   Files are just **Markdown + YAML**, portable and future-proof

---

## 🧭 Philosophy

> Your notes. Your files. Your rules.

Chronicler is built on three core principles:

-   **Ownership**: Your data is stored in plain text files on your local machine. You are not locked into a proprietary format or cloud service.
-   **Privacy**: The app works 100% offline. What you write is for your eyes only.
-   **Flexibility**: A simple, powerful set of tools for linking ideas, designed to adapt to your way of thinking.

---

## 🚀 Getting Started

1.  **Download the latest release**: Head to the [**Releases Page**](https://github.com/mak-kirkland/chronicler/releases/latest) and download the installer for your operating system.

    > #### ⚠️ A Note for Windows Users
    >
    > When you first run the installer, Microsoft Defender may show a "Windows protected your PC" screen. This is expected because Chronicler is a new application from an independent developer and is not yet code-signed.
    >
    > To proceed, simply click **"More info"** and then **"Run anyway"**. The application is safe to use, and you can verify the open-source code here on GitHub.

    > #### 🍎 A Note for macOS Users
    >
    > Chronicler for macOS is currently **unsigned**, which means macOS will block it the first time you try to open it. To get it running, you will need to run a command in the Terminal.
    >
    > 1.  **Download** the `.dmg` file and move the app to your **Applications** folder.
    > 2.  **Open the Terminal** app.
    > 3.  **Run this command**:
    >     ```sh
    >     sudo xattr -rd com.apple.quarantine /Applications/chronicler.app
    >     ```
    > 4.  The app will now open correctly.

    > #### 🛡️ Security & Trust
    >
    > While the initial installer is unsigned, all in-app updates are cryptographically signed by me. This is handled by [Tauri's built-in updater](https://tauri.app/plugin/updater), which verifies the update signature before installing it. This ensures that all future updates are authentic and have not been tampered with.


2.  **Create a Vault**: A "vault" is the folder on your computer where Chronicler will store all your notes. You can create a new folder or select an existing one.

3.  📘 **[→ Read the Help Guide](HELP.md)**: Learn how to use Chronicler, write in Markdown, link pages, and organize your notes.

4.  **Start Writing!**: Create your first note and start linking your ideas.

---

## ❤️ Support Chronicler's Development

Chronicler is a free, open-source project driven by a passion for privacy and user ownership.

Your financial support directly funds development time, helping to build new features, fix bugs, and design a better user experience.

-   👉 [Join on Patreon](https://patreon.com/ChroniclerNotes) to vote on features.

-   👉 [Buy Me a Coffee](https://buymeacoffee.com/chronicler) for a one-time donation.

---

## 🛠️ Tech Stack

-   **Frontend**: Svelte 5
-   **Backend**: Rust
-   **Packaging**: Tauri 2.0

---

## 📫 Get in Touch

-   Bugs & Feature Requests: Please open an issue on [GitHub Issues](https://github.com/mak-kirkland/chronicler/issues)
-   Email: [mak.kirkland@proton.me](mailto:mak.kirkland@proton.me)
-   Discord: [Join here!](https://discord.gg/cXJwcbe2b7)

---

## 📜 License

This project is licensed under the Creative Commons BY-NC-SA 4.0 License - see the [LICENSE](LICENSE) file for details.
