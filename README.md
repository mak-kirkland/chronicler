# 📘 Chronicler – A Markdown-Based Offline Worldbuilding App

**Chronicler** is a free, open-source, standalone desktop application for fantasy worldbuilders, especially Game Masters and authors. It’s designed for full **offline use**, ensuring that **you own your data** — all files are saved locally in a standard, human-readable Markdown format using a clear folder hierarchy.

---

## ✨ Features (Planned & In Progress)

### 📂 File Structure & Markdown Rendering
- Organizes your world with simple **folders and Markdown files**, like Obsidian
- Real-time **Markdown rendering**, including images and code blocks
- **Frontmatter-based metadata** (YAML) for tags, infoboxes, and more

### 🔖 Tagging & Linking
- Inline and frontmatter-based **tags** with support for **tag hierarchies**
- Internal **[[wikilinks]]** with autocomplete
- **Backlinks** to quickly see where a page is referenced
- **Automatic indexing**: tag pages update themselves when tags are added/removed

### 🧠 Infoboxes & Templates
- Built-in support for structured data via **infoboxes** (e.g., for characters, items, locations)
- Easily define your own templates

### 🌐 Navigable Hierarchies
- Support for **multiple categorization paths** (e.g., `Characters/NPCs/Orelia` and `Factions/Eldritch Knights/Orelia`)
- Works via symlinks or smart virtual mapping, giving multiple access paths to the same file

### 🖼️ Media Support
- Image embedding via `![[images/filename.jpg]]`, stored locally under `images/`
- Drag-and-drop support for attaching media

### 🔐 Offline and Private
- 100% offline. No cloud, no lock-in.
- Files are Markdown + YAML — readable and portable forever.

### 📚 Future Ideas
- Search and filter by tag combinations
- Interactive maps and timelines
- Visual tag graphs
- Dice roller / encounter helper
- System-agnostic compatibility with TTRPGs

---

## 🔧 Tech Stack (Tentative)
- **Frontend:** Svelte (possibly Svelte 5)
- **Backend:** Rust (Tauri for desktop)
- **Markdown Engine:** Custom parser or integration with existing libraries like `markdown-it`, `pulldown-cmark`, or `mdast`
- **Packaging:** Tauri for a small, native desktop app

---

## 🚀 Contributing

This project is in early development! Contributions are welcome:

- UX/UI design
- Markdown or YAML parsing
- File system handling
- Testing across OSes
- Feature requests

---

## 🧭 Philosophy

> Your world. Your files. Your rules.  
> No cloud sync. No vendor lock-in. No subscriptions.

Chronicler is made for worldbuilders who believe in **local-first software**, **creative freedom**, and **future-proof files**. It’s everything you wish your notebook or wiki was — but built for fantasy.

---

## ❤️ Support the Project

Want to help keep Chronicler free, open, and offline? See the [Patreon pitch below](#patreon-pitch) or support the project with coffee and code.

---

## 📫 Contact & Community

- GitHub Issues – Feature requests, bugs
- Discord (Coming soon)
- Email: mak.kirkland@proton.me

---

# 🪙 Patreon Pitch: Support *Chronicler*

## 🧙‍♂️ Chronicler: A Worldbuilding App Built by Worldbuilders

Imagine a worldbuilding tool that doesn't tell you how to create. It just helps you **organize** and **explore** the world you imagine — offline, markdown-based, 100% yours.

**Chronicler** is a labor of love — an open-source app for worldbuilders and GMs who want:

- Zero subscription fees  
- Zero cloud dependency  
- Full ownership of your files and creative vision

I'm building Chronicler to give creators a tool that grows with your world, not one that walls you in.

---

### 🚧 Where Your Support Goes

- Core development time (Rust + Svelte)
- Cross-platform support (Windows, macOS, Linux)
- UI/UX improvements
- Infobox and tagging engine
- Drag-and-drop image and media support
- Maps, timelines, graphs

---

### 🎁 Patreon Tiers

- **€3/month** – *The Scribe*: Help keep development alive.
- **€7/month** – *The Archivist*: Vote on features.
- **€15/month** – *The Loremaster*: Help shape the app direction, Discord access, get early updates and builds.

---

Together, we can build a better tool for storytelling — one that doesn’t sell your data or chain your creativity.

👉 [Join the Patreon](https://patreon.com/ChroniclerWorldbuilder) and help build *Chronicler*.

