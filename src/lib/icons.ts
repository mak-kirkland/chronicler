/**
 * @file Defines the SVG icon packs available in the application.
 * Each pack contains the SVG paths for standard UI elements like folders and files.
 */

export interface IconPack {
    id: string;
    name: string;
    description: string;
    // Supports either raw SVG paths OR emoji/text strings.
    // The renderer (ThemedIcon) will need to handle this distinction.
    icons: {
        // File System
        folder: string;
        folderOpen: string;
        file: string;
        image: string;

        // Navigation & Sidebar
        tags: string;
        gallery: string;
        reports: string;
        back: string;
        forward: string;
        settings: string;
        help: string;
        info: string;

        // View Actions
        edit: string;
        preview: string;
        split: string;
        contents: string;
        backlinks: string;

        // UI Controls
        close: string;
        newFile: string;
        newFolder: string;

        // Editor Toolbar
        bold: string;
        italic: string;
        strikethrough: string;
        heading1: string;
        heading2: string;
        heading3: string;
    };
    // Helper flag to tell the component how to render
    type: "svg" | "text";
}

// The DEFAULT pack (Text-based)
export const defaultPack: IconPack = {
    id: "core",
    name: "Basic",
    description: "The original, lightweight text and emoji interface.",
    type: "text",
    icons: {
        folder: "📁",
        folderOpen: "📂",
        file: "📄",
        image: "🖼️",
        tags: "#",
        gallery: "🖼️",
        reports: "📈",
        back: "←",
        forward: "→",
        settings: "⚙️",
        help: "?",
        info: "ℹ",
        edit: "📝",
        preview: "👁️",
        split: "◧",
        contents: "📑",
        backlinks: "🔗",
        close: "×",
        newFile: "+📄",
        newFolder: "+📁",
        bold: "B",
        italic: "I",
        strikethrough: "S",
        heading1: "H1",
        heading2: "H2",
        heading3: "H3",
    },
};

// The OLD default pack, now "Professional"
export const professionalPack: IconPack = {
    id: "professional-pack",
    name: "Professional",
    description: "Clean vector icons for a modern look.",
    type: "svg",
    icons: {
        // File System
        folder: `<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>`,
        folderOpen: `<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>`,
        file: `<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7zM6 20V4h6v5h5v11H6z"/>`,
        image: `<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>`,

        // Navigation
        tags: `<path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/>`,
        gallery: `<path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/>`,
        reports: `<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>`,
        back: `<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>`,
        forward: `<path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>`,
        settings: `<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>`,
        help: `<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>`,
        info: `<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>`,

        // Actions
        edit: `<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>`,
        preview: `<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>`,
        split: `<path d="M10 18h5v-6h-5v6zm-6 0h5V5H4v13zm12 0h5v-6h-5v6zM10 5v6h11V5H10z"/>`,
        contents: `<path d="M4 18h17v-6H4v6zM4 5v6h17V5H4z"/>`,
        backlinks: `<path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>`,

        // UI Controls
        close: `<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>`,
        newFile: `<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3v2zm-3-7V3.5L18.5 9H13z"/>`,
        newFolder: `<path d="M20 6h-8l-2-2H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3v-3h2v3h3v2z"/>`,

        // Editor Toolbar
        bold: `<path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>`,
        italic: `<path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>`,
        strikethrough: `<path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/>`,
        heading1: `<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h2V7H7V5h10v2h-2v10h2v2z"/>`,
        heading2: `<path d="M5 4v3h5.5v10H5v3h14v-3h-5.5V7H19V4z"/>`,
        heading3: `<path d="M5 4v3h5.5v10H5v3h14v-3h-5.5V7H19V4z" transform="scale(0.8) translate(3,3)"/>`,
    },
};

export const fantasyPack: IconPack = {
    id: "fantasy-pack",
    name: "High Fantasy",
    description: "Parchment, wax seals, and ancient chests.",
    type: "svg",
    icons: {
        // File System - Wooden Chest
        folder: `<path d="M20,6H17V4a2,2,0,0,0-2-2H9A2,2,0,0,0,7,4V6H4A2,2,0,0,0,2,8V19a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V8A2,2,0,0,0,20,6ZM9,4h6V6H9ZM20,19H4V8H7v2h2V8h6v2h2V8h3Z" fill="#8B4513"/>
                 <path d="M7,8h2v2H7Zm9,0h2v2H16Z" fill="#FFD700"/>
                 <path d="M11,12a1,1,0,0,0,2,0V11a1,1,0,0,0-2,0Z" fill="#FFD700"/>`, // Gold accents

        // Open Chest with Gold Inside
        folderOpen: `<path d="M20,6H17V4a2,2,0,0,0-2-2H9A2,2,0,0,0,7,4V6H4A2,2,0,0,0,2,8V19a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V8A2,2,0,0,0,20,6ZM9,4h6V6H9ZM20,19H4V13H20Z" fill="#8B4513"/>
                     <rect x="5" y="14" width="14" height="4" fill="#FFD700" opacity="0.5"/>
                     <path d="M12,14a1.5,1.5,0,0,0,0,3,1.5,1.5,0,0,0,0-3Z" fill="#FFD700"/>`,

        // Parchment Scroll with Red Seal
        file: `<path d="M17,2H7A2,2,0,0,0,5,4V20a2,2,0,0,0,2,2H17a2,2,0,0,0,2-2V4A2,2,0,0,0,17,2Zm0,18H7V4h2v8l2.5-1.5L14,12V4h3Z" fill="#F5DEB3"/>
               <circle cx="11.5" cy="12" r="2" fill="#8B0000"/>`,

        // Ornate Gold Frame
        image: `<path d="M19,3H5A2,2,0,0,0,3,5V19a2,2,0,0,0,2,2H19a2,2,0,0,0,2-2V5A2,2,0,0,0,19,3Zm0,16H5V5H19ZM8,15l2.5,3.01L14,12l4,5H6Z" fill="#DAA520"/>
                <rect x="5" y="5" width="14" height="14" fill="#87CEEB" opacity="0.3"/>`, // Subtle sky bg

        // Navigation - Golden Compass
        tags: `<path d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" fill="#B8860B"/>
               <path d="M12,6l-1.5,4.5L6,12l4.5,1.5L12,18l1.5-4.5L18,12l-4.5-1.5Z" fill="#FFD700"/>`,

        // Gallery - Wooden Frames
        gallery: `<rect x="3" y="3" width="8" height="8" rx="1" stroke="#8B4513" fill="none" stroke-width="1.5"/>
                  <rect x="13" y="3" width="8" height="8" rx="1" stroke="#8B4513" fill="none" stroke-width="1.5"/>
                  <rect x="3" y="13" width="8" height="8" rx="1" stroke="#8B4513" fill="none" stroke-width="1.5"/>
                  <rect x="13" y="13" width="8" height="8" rx="1" stroke="#8B4513" fill="none" stroke-width="1.5"/>
                  <rect x="4" y="4" width="6" height="6" fill="#F5DEB3" opacity="0.5"/>`,

        // Reports - Ancient List
        reports: `<path d="M16,2H8A2,2,0,0,0,6,4V20a2,2,0,0,0,2,2h8a2,2,0,0,0,2-2V4A2,2,0,0,0,16,2ZM9,6h6v2H9ZM9,10h6v2H9ZM9,14h4v2H9Z" fill="#F5DEB3"/>
                  <path d="M9,6h6v2H9ZM9,10h6v2H9ZM9,14h4v2H9Z" fill="#8B4513"/>`,

        // Bronze Arrows
        back: `<path d="M20,11H7.83l5.59-5.59L12,4,4,12l8,8,1.41-1.41L7.83,13H20Z" fill="#CD7F32"/>`,
        forward: `<path d="M12,4,10.59,5.41,16.17,11H4v2H16.17l-5.58,5.59L12,20l8-8Z" fill="#CD7F32"/>`,

        // Bronze Gear
        settings: `<path d="M19.14,12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.5.5,0,0,0,.12-.61l-1.92-3.32a.5.5,0,0,0-.59-.22l-2.39.96a7.9,7.9,0,0,0-1.62-.94l-.36-2.54a.5.5,0,0,0-.48-.41H10.08a.5.5,0,0,0-.47.41l-.36,2.54a7.9,7.9,0,0,0-1.62.94l-2.39-.96a.5.5,0,0,0-.59.22L2.74,8.87a.5.5,0,0,0,.12.61l2.03,1.58c-.05.3-.09.63-.09.94s.02.64.07.94L2.84,14.53a.5.5,0,0,0-.12.61l1.92,3.32a.5.5,0,0,0,.59.22l2.39-.96a7.9,7.9,0,0,0,1.62.94l.36,2.54a.5.5,0,0,0,.48.41h3.84a.5.5,0,0,0,.47-.41l.36-2.54a7.9,7.9,0,0,0,1.62-.94l2.39.96a.5.5,0,0,0,.59-.22l1.92-3.32a.5.5,0,0,0-.12-.61ZM12,15.6a3.6,3.6,0,1,1,3.6-3.6A3.6,3.6,0,0,1,12,15.6Z" fill="#CD7F32"/>
                   <circle cx="12" cy="12" r="2" fill="#8B4513"/>`,

        // Gold Question
        help: `<path d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm1,17h-2v-2h2Zm2.07-7.75-.9.92C13.45,12.9,13,13.5,13,15h-2v-.5a2,2,0,0,1,.6-1.41l1.81-1.83A2,2,0,0,0,12,7c-1.1,0-2,.9-2,2H8a4,4,0,0,1,8,0A3.92,3.92,0,0,1,15.07,11.25Z" fill="#FFD700"/>`,

        // Wax Seal Info
        info: `<circle cx="12" cy="12" r="10" fill="#8B0000"/>
               <path d="M11,17h2v-6h-2Zm0-8h2V7h-2Z" fill="#F5DEB3"/>`,

        // White Quill
        edit: `<path d="M3,17.25V21H6.75L17.81,9.94,14.06,6.19ZM20.71,7a1,1,0,0,0,0-1.41L18.37,3.29a1,1,0,0,0-1.41,0L15.13,5.12l3.75,3.75Z" fill="#F5F5F5"/>
               <path d="M14.06,6.19,3,17.25l0,0a.5.5,0,0,0-.13.23L2.2,20.8a.5.5,0,0,0,.6.6l3.32-.67a.5.5,0,0,0,.23-.13L17.41,9.54Z" fill="#2F4F4F"/>`,

        // Mystical Eye
        preview: `<path d="M12,4.5C7,4.5,2.73,7.61,1,12c1.73,4.39,6,7.5,11,7.5s9.27-3.11,11-7.5C21.27,7.61,17,4.5,12,4.5ZM12,17a5,5,0,1,1,5-5A5,5,0,0,1,12,17Zm0-8a3,3,0,1,0,3,3A3,3,0,0,0,12,9Z" fill="#9370DB"/>
                  <circle cx="12" cy="12" r="1.5" fill="#FFFFFF"/>`,

        split: `<path d="M10,18h5V12H10Zm-6,0h5V5H4Zm12,0h5V12H16ZM10,5v6h11V5Z" fill="#CD7F32"/>`,

        // Leather Book
        contents: `<path d="M4,6H20V4H4ZM4,11H20V9H4ZM4,16H20V14H4ZM4,21H20V19H4Z" fill="#8B4513"/>
                   <rect x="5" y="4" width="14" height="15" fill="#F5DEB3" opacity="0.2"/>`,

        // Iron Chain
        backlinks: `<path d="M17,7H13v1.9h4a3.1,3.1,0,0,1,0,6.2H13V17h4a5,5,0,0,0,0-10ZM8,11v2h8V11ZM7,15.1A3.1,3.1,0,0,1,7,8.9h4V7H7a5,5,0,0,0,0,10h4V15.1Z" fill="#708090"/>`,

        // UI Controls - Red Wax Seal Cross
        close: `<circle cx="12" cy="12" r="10" fill="#8B0000"/>
                <path d="M15.71,14.29a1,1,0,0,1,0,1.42,1,1,0,0,1-1.42,0L12,13.41l-2.29,2.3a1,1,0,0,1-1.42,0,1,1,0,0,1,0-1.42l2.3-2.29L8.29,9.71a1,1,0,0,1,0-1.42,1,1,0,0,1,1.42,0L12,10.59l2.29-2.3a1,1,0,0,1,1.42,0,1,1,0,0,1,0,1.42L13.41,12Z" fill="#F5DEB3"/>`,

        // Scroll with Green Plus
        newFile: `<path d="M14,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8ZM13,3.5,18.5,9H13Z" fill="#F5DEB3"/>
                  <path d="M12,14H10v2H8V14H6V12H8V10h2v2h2Z" fill="#228B22"/>`,

        // Chest with Green Plus
        newFolder: `<path d="M20,6H17V4a2,2,0,0,0-2-2H9A2,2,0,0,0,7,4V6H4A2,2,0,0,0,2,8V19a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V8A2,2,0,0,0,20,6ZM9,4h6V6H9ZM20,19H4V8H7v2h2V8h6v2h2V8h3Z" fill="#8B4513"/>
                    <path d="M13,15H11v2H9V15H7V13H9V11h2v2h2Z" fill="#228B22"/>`,

        // Editor Toolbar - Calligraphy (Dark Ink)
        bold: `<path d="M14,10.5c1.1,0,2-.9,2-2s-.9-2-2-2H9v4ZM9,4v16h6c2.2,0,4-1.8,4-4,0-1.5-.8-2.8-2-3.5A3.75,3.75,0,0,0,19,9c0-2.2-1.8-4-4-4ZM14,16.5c1.1,0,2,.9,2,2s-.9,2-2,2H9v-4Z" fill="#2F4F4F"/>`,
        italic: `<path d="M10,4V7h2.21l-3.42,8H6v3H14V15H11.79l3.42-8H18V4Z" fill="#2F4F4F"/>`,
        strikethrough: `<path d="M10,19h4V16H10ZM5,4V7h5v3h4V7h5V4ZM3,14H21V12H3Z" fill="#2F4F4F"/>`,
        // Gold Headers
        heading1: `<text x="4" y="18" font-family="serif" font-weight="bold" font-size="20" fill="#DAA520">H1</text>`,
        heading2: `<text x="4" y="18" font-family="serif" font-weight="bold" font-size="17" fill="#DAA520">H2</text>`,
        heading3: `<text x="4" y="18" font-family="serif" font-weight="bold" font-size="14" fill="#DAA520">H3</text>`,
    },
};

export const sciFiPack: IconPack = {
    id: "scifi-pack",
    name: "Cyber System",
    description: "Holographic data cubes and neon terminals.",
    type: "svg",
    icons: {
        // File System - Server Rack / Chip
        folder: `<path d="M2,4V20H22V4ZM20,18H4V6H20ZM6,8H8v2H6Zm0,4H8v2H6ZM10,8h8v2H10Zm0,4h8v2H10Z" fill="#0ff"/>
                 <path d="M20,4H4A2,2,0,0,0,2,6V18a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V6A2,2,0,0,0,20,4Zm0,14H4V6H20Z" opacity="0.5"/>`, // Glow effect

        // Active Server (Open)
        folderOpen: `<path d="M2,4V20H22V4ZM20,18H4V6H20ZM6,8H8v2H6Zm0,4H8v2H6ZM10,8h8v2H10Zm0,4h8v2H10Z" fill="#f0f"/>
                     <rect x="10" y="8" width="8" height="2" fill="#fff" opacity="0.8"/>`, // Highlight

        // Data Cube
        file: `<path d="M12,2,2,7l10,5,10-5ZM3.3,7,12,11.35,20.7,7,12,2.65ZM2,17l10,5V12L2,7Zm2-8.3L10,11.7v8.6L4,17.3ZM12,22l10-5V7L12,12Zm2-10.3L20,8.7v8.6L14,20.3Z" fill="#0f0"/>`,

        // Hologram Projection
        image: `<path d="M4,18l3-6,4,5,3-4,6,8H4Z" fill="#0ff" opacity="0.6"/>
                <path d="M21,3H3A2,2,0,0,0,1,5V19a2,2,0,0,0,2,2H21a2,2,0,0,0,2-2V5A2,2,0,0,0,21,3ZM21,19H3V5H21Z" stroke="currentColor"/>`,

        // Navigation - Circuit / Node
        tags: `<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
               <line x1="12" y1="2" x2="12" y2="9" stroke="currentColor" stroke-width="2"/>
               <line x1="12" y1="15" x2="12" y2="22" stroke="currentColor" stroke-width="2"/>
               <line x1="2" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="2"/>
               <line x1="15" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>`,

        // Gallery - Grid
        gallery: `<rect x="2" y="2" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"/>
                  <rect x="13" y="2" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"/>
                  <rect x="2" y="13" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"/>
                  <rect x="13" y="13" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"/>
                  <rect x="4" y="4" width="5" height="5" fill="currentColor" opacity="0.5"/>`,

        // Reports - Data Graph
        reports: `<path d="M2,20H22" stroke="currentColor" stroke-width="2"/>
                  <path d="M2,4V20" stroke="currentColor" stroke-width="2"/>
                  <path d="M4,16l4-8,4,6,4-10,4,8" fill="none" stroke="#0f0" stroke-width="2"/>
                  <circle cx="8" cy="8" r="2" fill="#0f0"/>`,

        // Tech Arrow
        back: `<path d="M20,11H7.83l5.59-5.59L12,4,4,12l8,8,1.41-1.41L7.83,13H20Z" fill="currentColor"/>
               <rect x="18" y="10" width="4" height="4" fill="#0ff" opacity="0.5"/>`,
        forward: `<path d="M12,4,10.59,5.41,16.17,11H4v2H16.17l-5.58,5.59L12,20l8-8Z" fill="currentColor"/>
                  <rect x="2" y="10" width="4" height="4" fill="#0ff" opacity="0.5"/>`,

        // Gear / Chip
        settings: `<path d="M19.14,12.94a7.6,7.6,0,0,0,0-1.88l2.1-1.63a.5.5,0,0,0,.12-.61l-2-3.46a.5.5,0,0,0-.61-.22l-2.49,1a7.32,7.32,0,0,0-3.24-1.88L12.64,2a.5.5,0,0,0-.5-.41H9.86a.5.5,0,0,0-.5.41L9,4.26a7.32,7.32,0,0,0-3.24,1.88l-2.49-1a.5.5,0,0,0-.61.22L.66,8.83a.5.5,0,0,0,.12.61l2.1,1.63a7.6,7.6,0,0,0,0,1.88L.78,14.57a.5.5,0,0,0-.12.61l2,3.46a.5.5,0,0,0,.61.22l2.49-1a7.32,7.32,0,0,0,3.24-1.88L9.36,22a.5.5,0,0,0,.5.41h2.28a.5.5,0,0,0,.5-.41l.38-2.27a7.32,7.32,0,0,0,3.24-1.88l2.49,1a.5.5,0,0,0,.61-.22l2-3.46a.5.5,0,0,0-.12-.61ZM12,15.5A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
                   <circle cx="12" cy="12" r="1.5" fill="#0ff"/>`,

        // Help Terminal
        help: `<path d="M20,4H4A2,2,0,0,0,2,6V18a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V6A2,2,0,0,0,20,4Zm0,14H4V6H20Z"/>
               <text x="9" y="16" font-family="monospace" font-weight="bold" font-size="14" fill="#0f0">?</text>`,

        // Info Terminal
        info: `<path d="M20,4H4A2,2,0,0,0,2,6V18a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V6A2,2,0,0,0,20,4Zm0,14H4V6H20Z"/>
               <rect x="11" y="8" width="2" height="2" fill="#0ff"/>
               <rect x="11" y="11" width="2" height="5" fill="#0ff"/>`,

        // Edit / Console
        edit: `<path d="M3,17.25V21H6.75L17.81,9.94,14.06,6.19ZM20.71,7a1,1,0,0,0,0-1.41L18.37,3.29a1,1,0,0,0-1.41,0L15.13,5.12l3.75,3.75Z"/>
               <path d="M2,22h20" stroke="#0f0" stroke-width="2"/>`, // Underline cursor

        // Eye Scanner
        preview: `<path d="M12,4.5C7,4.5,2.73,7.61,1,12c1.73,4.39,6,7.5,11,7.5s9.27-3.11,11-7.5C21.27,7.61,17,4.5,12,4.5ZM12,17a5,5,0,1,1,5-5A5,5,0,0,1,12,17Z" stroke="#f00" fill="none" stroke-width="1.5"/>
                  <circle cx="12" cy="12" r="2" fill="#f00"/>
                  <line x1="12" y1="2" x2="12" y2="22" stroke="#f00" stroke-width="1" opacity="0.5"/>`, // Scan line

        split: `<rect x="2" y="4" width="9" height="16" fill="none" stroke="currentColor" stroke-width="2"/>
                <rect x="13" y="4" width="9" height="16" fill="none" stroke="currentColor" stroke-width="2"/>
                <line x1="12" y1="2" x2="12" y2="22" stroke="#0ff" stroke-width="1" stroke-dasharray="2 2"/>`,

        // Data Readout
        contents: `<rect x="3" y="4" width="18" height="16" fill="none" stroke="currentColor" stroke-width="2"/>
                   <line x1="5" y1="8" x2="19" y2="8" stroke="#0f0" stroke-width="1"/>
                   <line x1="5" y1="12" x2="15" y2="12" stroke="#0f0" stroke-width="1"/>
                   <line x1="5" y1="16" x2="17" y2="16" stroke="#0f0" stroke-width="1"/>`,

        // Network Node
        backlinks: `<circle cx="5" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
                    <circle cx="19" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
                    <line x1="8" y1="12" x2="16" y2="12" stroke="#0ff" stroke-width="2"/>`,

        // UI Controls - Power Button X
        close: `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                <line x1="8" y1="8" x2="16" y2="16" stroke="#f00" stroke-width="2"/>
                <line x1="16" y1="8" x2="8" y2="16" stroke="#f00" stroke-width="2"/>`,

        // Datapad +
        newFile: `<path d="M16,2H8A2,2,0,0,0,6,4V20a2,2,0,0,0,2,2h8a2,2,0,0,0,2-2V4A2,2,0,0,0,16,2ZM12,17h-2v-2h2Zm0-4h-2V7h2Z"/>
                  <rect x="14" y="14" width="6" height="2" fill="#0f0"/>
                  <rect x="16" y="12" width="2" height="6" fill="#0f0"/>`,

        // Server +
        newFolder: `<path d="M2,4V20H22V4ZM20,18H4V6H20ZM6,8H8v2H6Zm0,4H8v2H6Zm4-4h8v2H10Zm0,4h8v2H10Z"/>
                    <rect x="14" y="14" width="6" height="2" fill="#0f0"/>
                    <rect x="16" y="12" width="2" height="6" fill="#0f0"/>`,

        // Editor Toolbar - Pixel / Terminal Styles
        bold: `<text x="5" y="18" font-family="monospace" font-weight="900" font-size="20">B</text>`,
        italic: `<text x="5" y="18" font-family="monospace" font-style="italic" font-size="20">I</text>`,
        strikethrough: `<text x="5" y="18" font-family="monospace" text-decoration="line-through" font-size="20">S</text>`,
        heading1: `<text x="2" y="18" font-family="monospace" font-weight="bold" font-size="20">H1</text>`,
        heading2: `<text x="2" y="18" font-family="monospace" font-weight="bold" font-size="16">H2</text>`,
        heading3: `<text x="2" y="18" font-family="monospace" font-weight="bold" font-size="12">H3</text>`,
    },
};

// Master registry used by the store
export const iconPacks: Record<string, IconPack> = {
    core: defaultPack,
  // "professional-pack": professionalPack,
    "fantasy-pack": fantasyPack,
  // "scifi-pack": sciFiPack,
};
