// Pure CSV builder tuned to "opens cleanly in Excel" (and LibreOffice Calc).
//
// Rules (these are what makes Excel read the file as a real spreadsheet
// without the "import wizard" guess-step):
//   - UTF-8 BOM (`\uFEFF`) at the very start. Excel sniffs the BOM to pick the
//     encoding; without it a UTF-8 file with any non-ASCII text gets read as
//     the system codepage and Ugandan names with accents mangle.
//   - CRLF (`\r\n`) line endings. Excel/Calc on Windows expect CRLF; a lone
//     LF inside a quoted field is still preserved as an in-field newline.
//   - Comma field separator.
//   - EVERY field is double-quoted, always. Quoting everything is the only way
//     to be robust against content the teacher didn't expect (a student name
//     with a comma, a topic title with a quote). Embedded `"` is escaped by
//     doubling (`"` → `""`).
//
// No React, no IO, no Tauri — pure string in, string out. The TeacherDashboard
// (W6) calls this then hands the result to the Tauri save dialog + fs write.

/**
 * Build a CSV string from a 2D array of cell values, with optional headers as
 * the first row.
 *
 * Every cell is stringified with `String(value)` (so numbers/booleans are
 * fine), then every field is quoted. `null`/`undefined` become the empty
 * string. The result starts with the BOM and ends with a trailing CRLF after
 * the last row.
 *
 * @param rows  The data rows; each row is an array of cell values.
 * @param headers  Optional first row (the column header values).
 */
export function toCsv(
  rows: string[][],
  headers?: string[],
): string {
  const allRows: string[][] = [];
  if (headers) allRows.push(headers);
  for (const r of rows) allRows.push(r);

  const lines = allRows.map((r) => r.map(quoteField).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/**
 * Quote a single field for CSV.
 *
 * Always wraps the value in `"..."`. Embedded double-quotes are doubled. Any
 * value (including `null`/`undefined`) is coerced to a string first; those two
 * become the empty string so an empty cell renders as `""` (an empty quoted
 * field), not the literal text "null".
 */
function quoteField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Escape embedded double-quotes by doubling.
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}
