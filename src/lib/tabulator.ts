// src/lib/tabulatorUtils.ts

/**
 * Parses an HTML table element into the data and column definition objects
 * that Tabulator requires.
 * @param table The HTMLTableElement to parse.
 * @returns An object with 'columns' and 'data' arrays for Tabulator.
 */
export function htmlTableToTabulatorData(table: HTMLTableElement) {
    // 1. Find the single header row, prioritizing <thead> but falling back to the first row.
    const headerRow = table.querySelector("thead tr, tr:first-child");
    if (!headerRow) {
        // If there's no header row at all, we can't build a table.
        return { columns: [], data: [] };
    }

    // 2. Get the cells from ONLY that header row.
    const headerCells = Array.from(headerRow.querySelectorAll("th, td"));

    const columns = headerCells.map((cell) => {
        const title = cell.textContent?.trim() || "";
        const fieldName = title.toLowerCase().replace(/[^a-z0-9]/g, "_");
        return {
            title: title,
            field: fieldName,
        };
    });

    // 3. Define data rows as ALL table rows that are NOT the header row.
    const allRows = Array.from(table.querySelectorAll("tr"));
    const dataRows = allRows.filter((row) => row !== headerRow);

    const data = dataRows.map((row) => {
        const rowData: Record<string, string> = {};
        Array.from(row.cells).forEach((cell, index) => {
            const fieldName = columns[index]?.field;
            if (fieldName) {
                // Use innerHTML to preserve links and other formatting within cells
                rowData[fieldName] = cell.innerHTML;
            }
        });
        return rowData;
    });

    return { columns, data };
}
