/**
 * @file Inserting images via the editor: an OS file picker (toolbar button) and
 * clipboard paste. Both copy the image into the vault through the backend and
 * insert a `![[file]]` wikilink at the cursor.
 *
 * Where images land and how they're named is driven by per-vault settings:
 *   - `imageImportLocation` — a fixed folder, or next to the current page;
 *   - `imageImportDir` — the folder used in "folder" mode;
 *   - `promptForImageName` — ask for a filename on single-image imports.
 */

import type { EditorView } from "@codemirror/view";
import { get } from "svelte/store";
import { open } from "@tauri-apps/plugin-dialog";
import {
    importImageFile,
    importImageFromClipboard,
    clipboardHasImage,
} from "$lib/commands";
import { insertImageRef } from "$lib/editor";
import {
    imageImportLocation,
    imageImportDir,
    promptForImageName,
} from "$lib/settingsStore";
import { vaultPath } from "$lib/worldStore";
import { openModal, closeModal } from "$lib/modalStore";
import TextInputModal from "$lib/components/modals/TextInputModal.svelte";
import { translate } from "$lib/i18n";

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

/** The last path segment of `p`, handling both `/` and `\` separators. */
function basename(p: string): string {
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i >= 0 ? p.slice(i + 1) : p;
}

/** Split a filename into its stem and extension (extension without the dot). */
function splitName(filename: string): { stem: string; ext: string } {
    const dot = filename.lastIndexOf(".");
    return dot > 0
        ? { stem: filename.slice(0, dot), ext: filename.slice(dot + 1) }
        : { stem: filename, ext: "" };
}

/**
 * The vault-relative directory new images for the given page should be written
 * to. In "folder" mode that's the configured folder; in "adjacent" mode it's the
 * page's own folder (empty string = the vault root).
 */
function imageTargetDir(pagePath: string): string {
    if (get(imageImportLocation) !== "adjacent") {
        return get(imageImportDir);
    }
    const vp = get(vaultPath) ?? "";
    const rel = pagePath.replace(vp, "").replace(/^[/\\]/, "");
    const lastSep = Math.max(rel.lastIndexOf("/"), rel.lastIndexOf("\\"));
    return lastSep >= 0 ? rel.slice(0, lastSep) : "";
}

/**
 * Show the name dialog prefilled with `defaultStem`, resolving to the entered
 * stem, or `null` if the user dismissed it without submitting.
 */
function promptForName(defaultStem: string): Promise<string | null> {
    // A Promise can only settle once, so a later `resolve(null)` from onClose is
    // a no-op after onSubmit has already resolved with the typed value.
    return new Promise((resolve) => {
        openModal({
            component: TextInputModal,
            props: {
                title: translate("imageInsert.nameImage"),
                label: translate("imageInsert.fileName"),
                initialValue: defaultStem,
                onSubmit: (value: string) => {
                    resolve(value);
                    closeModal();
                },
                onClose: () => {
                    resolve(null);
                    closeModal();
                },
            },
        });
    });
}

/** Open the OS file picker, copy each chosen image into the vault, and insert references. */
export async function pickAndInsertImages(
    view: EditorView,
    pagePath: string,
): Promise<void> {
    let selected: string | string[] | null;
    try {
        selected = await open({
            multiple: true,
            directory: false,
            title: translate("editor.insertImage"),
            filters: [
                {
                    name: translate("imageInsert.imagesFilter"),
                    extensions: IMAGE_EXTENSIONS,
                },
            ],
        });
    } catch (e) {
        alert(translate("imageInsert.pickerFailed", { error: String(e) }));
        return;
    }
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const dir = imageTargetDir(pagePath);
    // Only prompt for a single image; a multi-file batch keeps original names.
    const promptSingle = get(promptForImageName) && paths.length === 1;
    for (const path of paths) {
        try {
            let nameOverride: string | null = null;
            if (promptSingle) {
                const { stem, ext } = splitName(basename(path));
                const typed = await promptForName(stem);
                if (typed === null) continue; // dismissed
                nameOverride = ext ? `${typed}.${ext}` : typed;
            }
            const result = await importImageFile(path, dir, nameOverride);
            insertImageRef(view, result.filename);
        } catch (e) {
            alert(translate("imageInsert.insertFailed", { error: String(e) }));
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
    pagePath: string,
): Promise<void> {
    const dir = imageTargetDir(pagePath);
    try {
        let nameOverride: string | null = null;
        // Only prompt for a true bitmap; pasted files keep their own names and
        // pasted text must fall through to a normal paste without a dialog.
        if (get(promptForImageName) && (await clipboardHasImage())) {
            const typed = await promptForName(pageName || "image");
            if (typed === null) return; // dismissed
            nameOverride = `${typed}.png`;
        }
        const results = await importImageFromClipboard(
            pageName,
            dir,
            nameOverride,
        );
        for (const result of results) insertImageRef(view, result.filename);
    } catch (e) {
        alert(translate("imageInsert.pasteFailed", { error: String(e) }));
    }
}
