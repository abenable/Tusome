// Pure helpers for the AdminPanel "About" section (W7).
//
// `parseManifestVersion` is extracted so the JSON-parsing logic is testable
// without a DOM or a Rust invoke — the same reasoning as the other pure
// decision helpers in src/lib (csv, student-context.resolveInitialState).
// The AdminPanel fetches the manifest JSON via the `get_content_manifest_version`
// Rust command at runtime; this helper covers the case where the frontend
// already has the raw JSON (e.g. a future "upload manifest" affordance) and is
// the unit-testable core of "read a version out of a manifest blob".

/**
 * Read the `version` field out of a parsed manifest blob. Returns `"unknown"`
 * for anything that isn't a string or number version — matching the Rust
 * command's fallback so the panel never shows `undefined`/`null`.
 *
 *   { version: "2026.01" }   → "2026.01"
 *   { version: 2 }           → "2"
 *   { }                       → "unknown"
 *   "not an object"           → "unknown"
 *   null                      → "unknown"
 */
export function parseManifestVersion(json: unknown): string {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return "unknown";
  }
  const v = (json as Record<string, unknown>).version;
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "unknown";
}
