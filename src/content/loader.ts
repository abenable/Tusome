// Content-pack loader.
//
// Reads pack JSON and validates each against the `Pack` schema with `safeParse`,
// log + skip on failure — never throws. A malformed pack dropped on a USB stick
// must not crash the app during a lesson.
//
// ── Two read paths ───────────────────────────────────────────────────────
//
//   1. Tauri runtime (production + `bun tauri dev`): `invoke("read_content_packs")`.
//      The Rust command reads the writable app-data content dir (seeded on
//      first run — see src-tauri/src/lib.rs), falling back to the bundled
//      resources and, in debug, the repo-root tree. Reading is a Rust command
//      rather than the JS plugin-fs so there is no fs capability-scope to
//      configure and the production read path is exercised exactly the way a
//      school machine uses it.
//
//   2. Non-Tauri (`bun test`, plain `bun run dev`): walk the repo-root `content/`
//      dir with `node:fs`. `CBL_CONTENT_DIR` overrides the root so tests can
//      point at a temp tree instead of polluting curated content.
//
// Both paths return `{ path, raw }[]`; the JSON.parse + safeParse + skip logic
// is shared below.

import { Pack, type PackT, type TopicT } from "./schema";
import type { QueryClient } from "@tanstack/react-query";

export interface LoadResult {
  packs: PackT[];
  /** Pack file paths that failed validation and were skipped. */
  skipped: Array<{ path: string; error: string }>;
}

interface RawFile {
  path: string;
  raw: string;
}

// ---------------------------------------------------------------------------
// Tauri detection
// ---------------------------------------------------------------------------

/**
 * True only inside a running Tauri shell. The `@tauri-apps/*` packages are
 * present in `node_modules` (the build needs them), so a bare `import(...)`
 * succeeds even outside Tauri — import success can't mean "we're in Tauri".
 * Instead we look for the runtime marker Tauri injects on the global window.
 */
function isTauri(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load and validate every pack. `safeParse`s each; invalid packs are logged to
 * `console.error` and skipped. Never throws.
 */
export async function loadPacks(): Promise<LoadResult> {
  const files = isTauri() ? await loadFromTauri() : await loadFromRepo();
  return parseFiles(files);
}

function parseFiles(files: RawFile[]): LoadResult {
  const packs: PackT[] = [];
  const skipped: Array<{ path: string; error: string }> = [];

  for (const { path, raw } of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const error = `invalid JSON: ${String(err)}`;
      console.error(`[content] ${path}: ${error}`);
      skipped.push({ path, error });
      continue;
    }

    const result = Pack.safeParse(parsed);
    if (!result.success) {
      const error = result.error.message;
      console.error(`[content] ${path} failed schema validation:\n${error}`);
      skipped.push({ path, error });
      continue;
    }

    packs.push(result.data);
  }

  return { packs, skipped };
}

async function loadFromTauri(): Promise<RawFile[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<RawFile[]>("read_content_packs");
}

// Non-Tauri: walk the repo-root content/ (or $CBL_CONTENT_DIR) with node:fs.
// `@vite-ignore` keeps Vite from trying to externalize the node builtin for
// the browser build (this branch is dead in the webview — isTauri() is true
// there — but Vite analyzes it statically).
async function loadFromRepo(): Promise<RawFile[]> {
  const fs = await import(/* @vite-ignore */ "node:fs/promises");
  const out: RawFile[] = [];
  await walk(repoContentDir(), fs, out);
  return out;
}

async function walk(
  dir: string,
  fs: typeof import("node:fs/promises"),
  out: RawFile[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      await walk(p, fs, out);
    } else if (e.name === "pack.json") {
      try {
        out.push({ path: p, raw: await fs.readFile(p, "utf-8") });
      } catch {
        // skip unreadable file
      }
    }
  }
}

function repoContentDir(): string {
  const override =
    typeof process !== "undefined" ? process.env?.CBL_CONTENT_DIR : undefined;
  if (override) return override;
  // This file lives at <repo>/src/content/loader.ts → go up two dirs to repo
  // root. `import.meta.dirname` is stable under bun and (vite) dev; this branch
  // never runs in the webview build.
  const here = import.meta.dirname;
  const parts = here.split("/");
  const repoRoot = parts.slice(0, -2).join("/");
  return `${repoRoot}/content`;
}

// ---------------------------------------------------------------------------
// TanStack Query — cache the walk once, invalidate by hand on USB update.
// `ensureQueryData` fetches on first call and serves from cache after, so the
// four subject/topic routes share one filesystem walk instead of re-walking on
// every navigation.
// ---------------------------------------------------------------------------

export const PACKS_QUERY_KEY = ["packs"] as const;

export async function loadPacksCached(qc: QueryClient): Promise<LoadResult> {
  return qc.ensureQueryData({
    queryKey: PACKS_QUERY_KEY,
    queryFn: loadPacks,
  }) as Promise<LoadResult>;
}

// ---------------------------------------------------------------------------
// Convenience accessors against an already-loaded pack list.
// ---------------------------------------------------------------------------

export function findTopicInPacks(packs: PackT[], topicId: string): TopicT | null {
  for (const pack of packs) {
    const topic = pack.topics.find((t) => t.id === topicId);
    if (topic) return topic;
  }
  return null;
}

export function topicsForSubject(
  packs: PackT[],
  subject: TopicT["subject"],
): TopicT[] {
  const out: TopicT[] = [];
  for (const pack of packs) {
    for (const topic of pack.topics) {
      if (topic.subject === subject) out.push(topic);
    }
  }
  return out;
}

/** Load all topics across all valid packs, optionally filtered by subject. */
export async function loadTopicsForSubject(
  subject: TopicT["subject"],
): Promise<TopicT[]> {
  const { packs } = await loadPacks();
  return topicsForSubject(packs, subject);
}

/**
 * Load the first pack that contains a topic with the given id. Returns `null`
 * if no such topic exists in any valid pack.
 */
export async function loadPackForTopic(
  topicId: string,
): Promise<{ pack: PackT; topic: TopicT } | null> {
  const { packs } = await loadPacks();
  for (const pack of packs) {
    const topic = pack.topics.find((t) => t.id === topicId);
    if (topic) return { pack, topic };
  }
  return null;
}
