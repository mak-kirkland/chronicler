# 🧰 Getting Started

Welcome to **Chronicler** — your digital scriptorium for worldbuilding, notes, and knowledge management.

Chronicler stores your notes as plain Markdown (.md) files in a folder on your computer (called a **vault**).

---

## 📁 Vaults and Files

Your **vault** is just a folder on your computer. You decide where the world is stored, e.g `C:\Users\Michael\MyWorld`.

- ✅ Chronicler will index and render any Markdown file within the vault
- 🔁 Changes in your file system (rename, move, delete) are instantly detected
- 📂 You can create folders, drag-and-drop files, and organize content however you like

---

## ➕ Creating Pages and Folders

- Click the **+ New Page** button in the bottom left sidebar, or right-click on any folder in the file explorer to create a new **page** or **folder**.
- New pages start with a default **YAML frontmatter** block (see below)

---

## 📝 Writing in Markdown

Chronicler uses **Markdown** to format your pages.

- Use `# heading`, `## subheading`, `**bold**`, `*italic*`, `-` for bullet lists, and so on
- Use `---` to insert horizontal separators to divide long pages into readable sections.

---

## 🔗 Linking Between Pages

Use `[[Page Name]]` to link to other pages in your vault.

- Autocompletion helps you insert links quickly
- You can alias links with `[[Silverflow River|Silverflow]]`
- Backlinks are shown in the right sidebar so you can see what links *to* the current page
- When you rename a page, **all links to it are automatically updated**

---

## 🔖 YAML Frontmatter

Each page can start with an optional **YAML frontmatter** block to store metadata. This is used to generate the wiki-like "infobox" that acts as the page summary card. It's also used to add **tags** to your page (see below).

```yaml
---
title: Rivertown
infobox: Location
tags: [city, trade, river]
image: rivertown.jpg
---
```

All frontmatter fields are optional. There are four fields that have special behaviour:

| Field      | Description |
|------------|-------------|
| `title`    | Page display and infobox title (otherwise filename is used) |
| `subtitle` | Infobox subtitle |
| `infobox`  | Header text below the infobox image |
| `tags`     | List of tags for categorization |
| `image`    | Image shown in the infobox (see below) |

You can add any custom fields you want (e.g `height`, `age`, `capital`, `population` etc.). Any field that is not one of the four special fields above will be automatically added as a row in the infobox, giving you a flexible way to display structured data.

### Special syntax inside frontmatter values

Some values may contain special characters that need to be treated properly (for example `[[wikilinks]]` or `||spoilers||`). There are two safe ways to include these without breaking the frontmatter:

1. **Wrap the value in quotes**:

```yaml
motto: 'Strength | Honor'
race: '[[Elf|High Elf]]'
```

2. **Use a YAML block scalar (the pipe `|`) for multi-line or literal values**

```yaml
notes: |
  This value can contain literal pipes without escaping: A | B | C
  It can also contain wikilinks like [[Example Page]] or spoilers like ||secret||.
```

### ✍️ Inline Markdown in Field Values

Field values in the YAML frontmatter support **inline Markdown** formatting.
This means you can use emphasis like `**bold**`, `*italics*` etc., links, and even embed images.

For example:

```yaml
motto: '*Strength and Honor*'
homepage: '[Official Site](https://example.com)'
```

### 🖼🗺 Inline Images

You can embed small images directly inside field values. This is especially useful for flags, icons, or emblems that should appear next to text in the infobox.

- All image syntaxes are supported:
  - Wikilink: `![[lynorian-flag.png]]` (✅ recommended for simplicity)
  - Markdown: `![Alt text](lynorian-flag.png)`
  - HTML: `<img src="lynorian-flag.jpg">`

- Images must be relative to the `images/` folder in the vault root (see below).

- Inline images automatically scale to match the surrounding font size and align with text, making them perfect for inline symbols.

Example:

```yaml
allegiance: 'Lynorian Empire ![[lynorian-flag.png]]'
```

This will render the Lynorian Empire’s flag icon inline with the text in the infobox.

---

## 🏷️ Tags

You can tag pages using the `tags:` field in YAML frontmatter:

```yaml
tags: [city, coastal]
```

- Click on any tag to see a list of all pages with that tag

---

## 🖼️ Infoboxes and Images

You can display an image in a page’s **infobox** by adding the `image` field to the frontmatter:

```yaml
image: rivertown.jpg
```

There are three supported ways to specify the image path:

- ✅ **Relative to the `images/` folder** (recommended)
  - `image: rivertown.jpg` → loads `vault/images/rivertown.jpg`
  - `image: maps/northlands.png` → loads
    `vault/images/maps/northlands.png`
  - This method assumes you have created an `images` folder directly inside the vault root.

- 🗂️ **Relative to the vault root using `../`**
  - `image: ../factions/champions/banner.jpg` → loads
    `vault/factions/champions/banner.jpg`
  - Use this if you want to store images next to your Markdown files instead of inside `images/`

- ⚠️ **Absolute paths** (not recommended)
  - `image: C:/Users/Michael/Pictures/map.png`
  - This only works on your current machine and may break if you move
    the vault

Supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.svg`

---

## ✨ Images in the Page Body

You can also embed images directly within the main text of your page using standard HTML `<img>` tags. This gives you full control over styling like size, positioning, and text wrapping.

The path rules are the same as for infobox images. It's recommended to place your images in an `images` folder in your vault root and refer to them by filename.

### Basic Image

To add an image, simply use the `<img>` tag:

```html
<img src="world-map.jpg" alt="Map of the known world">
```

### Inline Image (e.g., Flags or Icons)

You can also place small images directly into a line of text. This is perfect for icons or flags. The `height: 1em;` style makes the image scale with the text, and `vertical-align: middle;` centers it nicely.

```html
The Gooblboys invaded the Lynorian Empire <img src="lynorian-flag.png" alt="Lynorian Empire Flag" style="height: 1em; vertical-align: middle;"> on a Saturday.
```

### Styled Image (Float Right)

You can add inline CSS styles to control the appearance. This example floats the image to the right of the text, adds some space around it, and sets its width.

```html
<img
  src="rivertown-market.png"
  alt="Bustling market square in Rivertown"
  style="float: right; margin-left: 1em; margin-bottom: 1em; width: 300px;"
>
```

The text on your page will wrap around the image. This is a great way to illustrate points without breaking the flow of the text.

### Image with a Caption

For a more structured image with a caption, wrap the `<img>` tag in `<figure>` and `<figcaption>` tags. This is great for creating a clean, professional look.

```html
<figure style="float: right; width: 250px; margin: 0 0 1em 1em;">
  <img src="silverflow-river.jpg" alt="The Silverflow River at dawn" style="width: 100%;">
  <figcaption style="font-size: 0.9em; text-align: center; font-style: italic;">
    The Silverflow River at dawn.
  </figcaption>
</figure>
```

### Simple Images

In addition to HTML `<img>` tags, Chronicler supports two simpler image syntaxes. These are easier to type but **do not** support the advanced styling (size, float, captions etc.) available with HTML.

#### Markdown image

```markdown
![Alt text](world-map.jpg)
```

#### Wikilink image

```markdown
![[world-map.jpg]]
```

---

## 🫣 Spoilers

You can use the **spoiler syntax** by wrapping text in double pipes `||like this||`.

Example:

```
The king’s advisor is ||secretly a vampire||
```

This will render as:
> The king’s advisor is ▓▓▓▓▓▓▓▓▓▓▓▓

Readers can click to reveal the hidden text, and click again to hide it.

---

## 🗄️ Tables

You can create tables using a combination of pipes (`|`) and hyphens (`-`). The first line contains the column headers, and the second line uses hyphens to separate the header from the rest of the table.

### Basic Table

To create a basic table, use the following syntax:

```markdown
| Header 1 | Header 2 | Header 3 |
|---|---|---|
| Row 1, Col 1 | Row 1, Col 2 | Row 1, Col 3 |
| Row 2, Col 1 | Row 2, Col 2 | Row 2, Col 3 |
```

### Aligning Content

You can control the alignment of content within columns by adding colons (`:`) to the header separator line.

* A colon on the left side of the hyphens makes the content **left-aligned** (this is the default).
* A colon on the right side makes the content **right-aligned**.
* A colon on both sides makes the content **centered**.

Example:

```markdown
| Item | Price |
|---|---:|
| Sword | 100gp |
| Shield | 75gp |
```

You can also use **standard HTML `<table>` tags** to create more complex tables with greater styling control.

---

## 🎨 Customizing Appearance

### 🌈 Themes

You can change the application's look and feel by going to **Settings**. Here you can switch between built-in themes, adjust the font size, or create your own custom themes with the Theme Editor.

### 🖋 Custom Fonts

Chronicler allows you to use your own font files for a truly custom appearance.

**How to add custom fonts:**

1. Find the application settings directory for your OS:
  - Windows: `%AppData%\io.github.mak-kirkland.chronicler\`
  - Linux: `~/.local/share/io.github.mak-kirkland.chronicler/`
  - macOS: `~/Library/Application Support/io.github.mak-kirkland.chronicler/`

2. Copy your desired font files (.woff2, .ttf, or .otf formats are supported) into the **fonts** folder within the settings directory.

3. Restart Chronicler: The next time you open the application, your custom fonts will be available to select in the Theme Editor.

---

## 📥 Importing Word Docs

You can import `.docx` files from Microsoft Word directly into your vault.

- Go to **Settings → Import from .docx** and choose your files
- Formatting (headings, bold, italics, links) is preserved
- Requires Pandoc (Chronicler can download it for you automatically)

---

## 💡 Tips

- Use folders to group related pages (e.g. `places/`, `people/`, `factions/`)
- Pages and folders are ordered alphabetically. If you want to enforce ordering, you can number them (e.g `1_people/`, `2_places/`)
- Use **tags** *and* folders — you can access pages in multiple ways

---

## ❓ Need Help?

- [Join the Discord community!](https://discord.gg/cXJwcbe2b7)
- [GitHub Issues](https://github.com/mak-kirkland/chronicler/issues) for bugs or feature requests

---

Happy chronicling! ✍️ - Michael
