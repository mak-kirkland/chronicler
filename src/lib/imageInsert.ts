/**
 * @file Inserting an image via the editor toolbar: opens the OS file picker,
 * copies the chosen image into the vault through the backend, and inserts a
 * `![[file]]` wikilink at the cursor.
 */

import type { EditorView } from "@codemirror/view";
import { open } from "@tauri-apps/plugin-dialog";
import { importImageFile, importImageFromClipboard } from "$lib/commands";
import { insertImageRef } from "$lib/editor";

const IMAGE_EXTENSIONS = [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "bmp",
    "svg",
    "avif",
];

/** Open the OS file picker, copy each chosen image into the vault, and insert references. */
export async function pickAndInsertImages(view: EditorView): Promise<void> {
    let selected: string | string[] | null;
    try {
        selected = await open({
            multiple: true,
            directory: false,
            title: "Insert image",
            filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
        });
    } catch (e) {
        alert(`Could not open the image picker: ${e}`);
        return;
    }
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
        try {
            const result = await importImageFile(path);
            insertImageRef(view, result.filename);
        } catch (e) {
            alert(`Could not insert image: ${e}`);
        }
    }
}

/**
 * Handle a paste in the editor: if the OS clipboard holds image(s) — a bitmap
 * (screenshot, "Copy Image") or file(s) copied in a file manager — copy them
 * into the vault and insert a reference for each. No-op when there are none.
 *
 * Reads the clipboard through the backend (the OS layer) rather than the paste
 * event's `clipboardData`, which comes back empty for images in some webviews
 * (notably WebKitGTK on Linux). The caller does not block the default paste, so
 * a normal text paste still works when there is no image.
 */
export async function pasteImageFromClipboard(
    view: EditorView,
    pageName: string,
): Promise<void> {
    // `pageName` names pasted bitmaps (the backend appends a timestamp). Files
    // copied from a file manager keep their own names, so it only affects bitmaps.
    try {
        const results = await importImageFromClipboard(pageName);
        for (const result of results) insertImageRef(view, result.filename);
    } catch (e) {
        alert(`Could not paste image: ${e}`);
    }
}
