/**
 * @file Inserting an image via the editor toolbar: opens the OS file picker,
 * copies the chosen image into the vault through the backend, and inserts a
 * `![[file]]` wikilink at the cursor.
 */

import type { EditorView } from "@codemirror/view";
import { open } from "@tauri-apps/plugin-dialog";
import { importImageFile } from "$lib/commands";
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
