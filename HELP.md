# 🧰 Getting Started

Welcome to **Chronicler** — your digital scriptorium for worldbuilding, notes, and knowledge management.

This guide is split into three parts. Start with **The Essentials** to learn the basics and get writing in minutes. When you're ready for more power, move on to the **Customization** and **Advanced Guide**.

---

## 🧱 Part 1: The Essentials

### 📦 Vaults and Files

Chronicler stores your notes as plain Markdown (`.md`) files in a folder on your computer, called a **vault**.

-   ✅ You choose where your vault lives (e.g., `C:\Users\YourName\MyWorld`).
-   📂 Create folders and organize your files however you like.
-   🔁 Changes made on your computer are instantly reflected in the app.

---

### 📝 Writing in Markdown

Chronicler uses **Markdown** to format your pages.

- Use `# heading`, `## subheading`, `**bold**`, `*italic*`, `-` for bullet lists, and so on
- Use `---` to insert horizontal separators to divide long pages into readable sections.
- Use `[^1]`,`[^2]` etc. for footnotes.

```
Here is a simple footnote[^1]. With some additional text after it.

[^1]: My reference.
```

---

### 🔗 Linking Between Pages

Use `[[Page Name]]` to link to other pages in your vault.

-   Create an alias with `[[Page Name|link text]]`.
-   Link directly to a section header with `[[Page Name#Header]]`.
-   When you rename a page, all links to it are automatically updated.

---

### 🔖 Infoboxes

At the top of each page is an **infobox** for at-a-glance details. This is controlled by a block of text at the very top of your file called **YAML frontmatter**. This is where you can set the page's title, add an image, and apply tags.

```yaml
---
title: Rivertown
image: rivertown.jpg
tags: [city, trade, river]
---
```

> Tip: There's an "Edit Infobox" button in the toolbar at the top of the Editor that lets you build the Infobox in a more graphical way.

---

### 🗂️ Organizing with Tags & Folders

There are two main ways to organize your vault:

1.  📂 **Folders**: Create folders in the file explorer to group related pages, like `Places/`, `Characters/`, or `History/`.
2.  🏷️ **Tags**: Add a list of tags to the `tags` field in the infobox. Click any tag to see all other pages with that tag.

```yaml
tags: [city, coastal]
```

> Tip: Pages and folders are ordered alphabetically. If you want to enforce a specific order, you can prefix them with numbers (e.g., `01_Characters`, `02_Places`, `03_History`).

---

### 🖼️ Images

You can store your images in any folder within your vault, e.g a central `images/` folder, or right next to your notes. Chronicler will find them automatically. You can also refer to images outside your vault by providing the full path (e.g `C:\Users\Michael\map.png`), or by using shortcuts/symlinks within the vault, however this is *not* recommended as it may slow down your pages.

#### 👤 Infobox Images

You can display an image in a page’s **infobox** by adding the `image` field to the frontmatter at the top of your file:

```yaml
image: rivertown.jpg
```

#### 🏞️ Page Images

The easiest way to add an image to the body of your page is with the wikilink syntax:

```markdown
![[world-map.jpg]]
```

*For more control over image size and placement, see the Advanced Guide.*

---

### 🫣 Spoilers

Hide text by wrapping it in double pipes `||like this||`. The text will be blacked out until a reader clicks on it.

```markdown
The king’s advisor is ||secretly a vampire||.
```

---

### 🗄️ Tables

Create simple tables with pipes `|` and dashes `-`.

```markdown
| Item   | Price |
|--------|-------|
| Sword  | 100gp |
| Shield | 75gp  |
```

> Tip: Links with custom text (e.g., `[[Page|Link text]]`) use the `|` symbol, which can break a table's structure. To fix this, just add a backslash `\` before it: `[[Page\|Link text]]`.

*For more control over tables, see the Advanced Guide.*

---

### 🧩 Page Inserts

Embed the content of one page directly inside another. This is great for reusing information (e.g navboxes, item cards, stat blocks...) so you only have to update it in one place.

```markdown
{{insert: Page Name}}
```

You can also set a custom title for the header, start the insert hidden, or remove all styling entirely and make the insert borderless.

```markdown
{{insert: The Great War | title="Summary of the Great War" | centered | hidden}}

{{insert: Enchanted Dagger | borderless}}
```

---

### 📄 Page Templates

Use templates to create new pages with a pre-defined structure, saving you time and ensuring consistency across your vault. For example, you could have templates for characters, locations, or session notes, each with pre-defined YAML frontmatter and section headings.

- **Manage Templates**: Go to **Settings → Manage Templates** to create and edit them.
- **Automatic Title**: Use the `{{title}}` placeholder in a template. It will be automatically replaced with the new page's name.

---

## 🛠️ Part 2: Customization

This section covers customization for your workflow and the appearance of your pages.

### ⚙️ Application Settings Directory
Chronicler stores global settings, themes and fonts in a dedicated folder on your computer. You can find it here:

- **Windows**: `%AppData%\io.github.mak-kirkland.chronicler\`
- **Linux**: `~/.local/share/io.github.mak-kirkland.chronicler/`
- **macOS**: `~/Library/Application Support/io.github.mak-kirkland.chronicler/`

---

### 🎨 Themes & Fonts

- **Themes**: Switch between built-in color schemes or create your own with the Theme Editor.
- **Custom Fonts**: Add your own `.woff2`, `.ttf`, or `.otf` font files to the `fonts` subfolder within the **Application Settings Directory**. After a restart, they will be available in the theme editor.hemes

---

## 🚀 Part 3: Advanced Guide

This section covers powerful features for enhancing your workflow.

### 🪪 Mastering the Infobox

The "infobox" at the top of each page is controlled by a block of text called **YAML frontmatter**. You can add any custom fields you want (e.g., `population`, `leader`, `age`), and they will automatically appear in the infobox.

Several fields have special functionality:

| Field      | Description                                                 |
|------------|-------------------------------------------------------------|
| `title`    | The display title for the page and infobox.                 |
| `subtitle` | A subtitle shown in the infobox.                            |
| `infobox`  | A header shown below the infobox image.                     |
| `tags`     | A list of tags for organization.                            |
| `image`    | An image or carousel of images for the infobox.             |
| `layout`   | Rules for creating headers and columns in the infobox.      |

#### 🎠 Infobox Carousels

Besides a single image, you can provide a list of images to create a carousel in the **infobox**:

```yaml
image: [rivertown_day.jpg, rivertown_night.jpg, rivertown_castle.jpg]
```

You can also add captions to each image in the carousel:

```
image: [[rivertown_day.jpg, "Day"], [rivertown_night.jpg, "Night"]]
```

#### 🚨 Special Syntax

Some values may contain special characters that need to be treated properly (for example `[[wikilinks]]` or `||spoilers||`). There are two safe ways to include these without breaking the frontmatter:

1. **Wrap the value in quotes**:

```yaml
motto: 'Strength | Honor'
race: '[[Elf|High Elf]]'
```

2. **For multi-line text, or to use special characters without quotes, start the line with a pipe symbol (`|`)**

```yaml
notes: |
  This text can contain [[wikilinks]] or ||spoilers|| directly.
  It can also span multiple lines.
```

#### ✒️ Inline Markdown

You can use Markdown like `**bold**` and `*italic*` inside field values.

```yaml
motto: '*Strength and Honor*'
homepage: '[Official Site](https://example.com)'
```

#### ⚜️ Inline Images

You can embed small images like flags or icons directly into infobox fields. This is great for adding visual flair next to text.

```yaml
allegiance: 'Lynorian Empire ![[lynorian-flag.png]]'
```

#### 🏗️ Infobox Layout

Use the `layout` key to add headers and group fields into columns for a professional, wiki-style infobox.

##### Adding Separators
-   `type: separator`: Defines the rule as a horizontal separator.
-   `above: 'field_name'`: Injects the separator immediately before `field_name`.

> Tip: You can define multiple separators using an array, e.g `below: [field1, field2]`.

##### Adding Headers
-   `type: header`: Defines the rule as a header.
-   `text: 'Your Text'`: The text to display in the header.
-   `below: 'field_name'`: Injects the header immediately after `field_name`.

##### Aliasing Keys
-   `type: alias`: Defines the rule as a key alias.
-   `keys: [field1, field2]`: A list of the frontmatter keys you want to rename.
-   `text: 'New Label'`: The custom text to display for these keys.

> Tip: This is useful for creating the visual effect of duplicate keys (e.g., displaying "Strength" for two different factions), which isn't possible in standard YAML.

##### Grouping Fields into Columns
-   `type: group`: Defines the rule as a group.
-   `keys: [field1, field2]`: A list of the frontmatter keys to include in the group.

##### Full Example
```yaml
---
title: Battle of the Somme
belligerents_allies: ["United Kingdom", "France"]
belligerents_central: ["German Empire"]
commander_allies: ["Douglas Haig", "Ferdinand Foch"]
commander_central: ["Erich von Falkenhayn"]

layout:
  - type: header
    text: Belligerents
    above: belligerents_allies
  - type: group
    keys: [belligerents_allies, belligerents_central]
  - type: header
    text: Commanders
    above: commander_allies
  - type: group
    keys: [commander_allies, commander_central]
---
```

---

### 📸 Advanced Images

#### 🔗 Clickable Images

You can turn any image into a link to another page by using the image as the link's **alias**.

```markdown
[[Page Name|![[image.png]]]]
```

This allows you to create clickable icons or badges directly in your text.

#### 🖼️ Image Galleries

Create wiki-style image galleries that arrange themselves into a grid. Images in a gallery are uniform in size and look great on any screen.

##### Basic Gallery

Wrap your images in a `<div class="gallery">`.

```html
<div class="gallery">
  ![[Map of the Realm]]
  ![[Castle Blueprint]]
  ![[Character Sketch]]
</div>
```

##### Captions

To add captions, wrap each image in a `<figure>` tag and add a `<figcaption>`.

```html
<div class="gallery">
  <figure>
    ![[King Alaric]]
    <figcaption>Alaric II, roughly 340 AC</figcaption>
  </figure>
  <figure>
    ![[Magic Sword]]
    <figcaption>The blade of infinite sorrow</figcaption>
  </figure>
</div>
```

##### Gallery Sizes

You can change the height of the gallery rows by adding a helper class to the container.

* `.small` (Small thumbnails)
* `.large` (Large detailed view)
* `.portrait` (2:3)
* `.landscape` (16:9)

```html
<div class="gallery small">
  ![[Icon 1]]
  ![[Icon 2]]
</div>
```

##### Custom Sizes

For precise control, you can set the exact dimensions using the `--gallery-height` and `--gallery-width` variables in the style attribute.

```html
<div class="gallery" style="--gallery-height: 500px;">
  ![[Tall Map]]
  ![[Tall Tower]]
</div>
```

#### 🎠 Image Carousels

You can turn a group of images into an interactive slideshow by wrapping them in a `<div class="carousel">`.

##### Basic Slideshow

To create a simple image carousel, just place your images inside the container.

```html
<div class="carousel">
  ![[Forest Day]]
  ![[Forest Night]]
  ![[Forest Winter]]
</div>
```

##### Captions

You can add captions to your slides by using the standard HTML `<figure>` syntax. The caption will appear below the active image.

```html
<div class="carousel">
  <figure>
    ![[Castle Gate]]
    <figcaption>The Main Gate</figcaption>
  </figure>
  <figure>
    ![[Castle Keep]]
    <figcaption>The Inner Keep</figcaption>
  </figure>
</div>
```

##### Tabbed Navigation

Add the `tabbed` class to switch from dot navigation to text-based tabs. This layout is perfect for switching between variations of a subject (e.g., floors of a map, or outfit changes).

> **Note:** For tabbed mode to activate, **every** image in the carousel must have a caption.

```html
<div class="carousel tabbed">
  <figure>
    ![[Tavern Floor 1]]
    <figcaption>Ground Floor</figcaption>
  </figure>
  <figure>
    ![[Tavern Floor 2]]
    <figcaption>Upper Rooms</figcaption>
  </figure>
  <figure>
    ![[Tavern Cellar]]
    <figcaption>Cellar</figcaption>
  </figure>
</div>
```

##### Sizes

You can control the height of the carousel using the same helper classes as the Gallery.

* **.small**: Compact view (150px height).
* **.large**: Expanded view (450px height).

```html
<div class="carousel large">
  ![[World Map]]
  ![[Region Map]]
</div>
```

#### 📐 Size & Alignment

For full control over an image's size, alignment, and caption, use HTML tags in the body of your page.

**Float an image to the right of your text:**
```html
<img
  src="rivertown-market.png"
  style="float: right; margin-left: 1em; width: 300px;"
>
```

**Add a caption using `<figure>`:**
```html
<figure style="float: right; width: 250px;">
  <img src="silverflow-river.jpg" style="width: 100%;">
  <figcaption style="text-align: center; font-style: italic;">
    The Silverflow River at dawn.
  </figcaption>
</figure>
```

#### 🎌 Inline Images (e.g. Flags or Icons)

You can also place small images directly into a line of text. This is perfect for icons or flags. The `height: 1em;` style makes the image scale with the text, and `vertical-align: middle;` centers it nicely.

```html
The Gooblboys invaded the Lynorian Empire <img src="lynorian-flag.png" style="height: 1em; vertical-align: middle;"> on a Saturday.
```

---

## 🗄️ Advanced Tables

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

### 🪄 Floating Content

Use floating layouts to place tables or images beside your text instead of above or below it.

Wrap your content in a `<div class="float-container">`, and add either `.float-left` or `.float-right` to the element you want to float.

```html
<div class="float-container">

  <table class="float-left">
    </table>

  <h3>Level 1</h3>
  To ease new players into the XP system...

</div>
```

> ⚠️ Markdown headers (`##`) won't wrap inside the container. Use HTML tags instead (`<h2>`).

---

### ✒️ Inline Styling

Use basic HTML tags directly in your Markdown to style specific pieces of text. This is useful for adding thematic fonts or colors. The `style` attribute is supported on `<p>` and `<span>` tags.

```html
<p style="font-family:'Your Custom Font'; color:blue; font-size:2rem">This paragraph will be big and blue.</p>
```

```html
This text is normal, but <span style="font-family:'Your Custom Font';">these words</span> are special.
```

---

### 🎨 CSS Variables

To ensure your inline styles blend seamlessly with Chronicler's themes, you can use the built-in CSS variables. Using these variables instead of hardcoded colors or fonts ensures your notes will automatically adapt if you change your theme.

Here are the available variables you can use:

**Typography**
* `--font-family-body`
* `--font-family-heading`

**Layout & Spacing**
* `--space-xs`
* `--space-sm`
* `--space-md`
* `--gallery-height`
* `--radius-base`

**Colors**
* `--color-background-primary`
* `--color-background-secondary`
* `--color-background-tertiary`
* `--color-text-primary`
* `--color-text-secondary`
* `--color-text-heading`
* `--color-border-primary`
* `--color-accent-primary`
* `--color-text-link`
* `--color-text-link-broken`
* `--color-text-error`
* `--color-background-error`
* `--color-border-error`

**UI Overlays**
* `--color-overlay-subtle`
* `--color-overlay-light`
* `--color-overlay-medium`
* `--color-overlay-dark`

**Syntax Highlighting**
* `--code-tag`
* `--code-attribute`
* `--code-string`
* `--code-background-inline`

You can apply these variables using the `var()` function inside standard HTML `style` attributes. For example, to make a specific piece of text use the accent color and heading font:

```html
<span style="color: var(--color-accent-primary); font-family: var(--font-family-heading);">
  This text uses Chronicler's native variables!
</span>
```

---

### 📥 Importing Word Docs

You can import `.docx` files from Microsoft Word directly into your vault.

- Go to **Settings → Import from .docx** and choose your files
- Formatting (headings, bold, italics, links) is preserved
- Requires Pandoc (Chronicler can download it for you automatically)

---

### ❓ Need Help?

- [Join the Discord community!](https://discord.gg/cXJwcbe2b7)
- [GitHub Issues](https://github.com/mak-kirkland/chronicler/issues) for bugs or feature requests

---

Happy chronicling! ✍️ - Michael
