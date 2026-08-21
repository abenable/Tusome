// Shared "Export class results to CSV" affordance (W7 admin panel).
//
// W6's TeacherDashboard has the same export inline (ExportBar). Rather than
// refactor W6 (out of scope for W7), this module is the shared, testable core:
// build the CSV matrix from the class grid, then drive the Tauri save dialog +
// fs write. Both the AdminPanel and a future TeacherDashboard refactor can call
// it; for now only the AdminPanel does. Outside Tauri (bun test, plain
// browser) it no-ops cleanly with a clear message — same guard as the loader.

import { toCsv } from "@/lib/csv";
import type { TopicT } from "@/content/schema";

export type ExportStudent = {
  id: number;
  display_name: string;
  class_label: string | null;
};

export type ExportResult = {
  /** What happened, for inline display. null = nothing to report (e.g. cancelled). */
  message: string | null;
  /** Machine-readable outcome. */
  outcome: "saved" | "cancelled" | "unavailable" | "error";
};

/**
 * Build the class-results CSV from the grid: header row = student names
 * (with class label in parens if present), each row = a topic with its
 * best-score cells as "NN%" or "—" when no attempts. Mirrors the on-screen
 * TeacherDashboard grid exactly.
 */
export function buildClassResultsCsv(
  students: ExportStudent[],
  topics: TopicT[],
  results: Map<string, number> | null,
): string {
  const headers = [
    "Topic",
    ...students.map((s) =>
      s.class_label ? `${s.display_name} (${s.class_label})` : s.display_name,
    ),
  ];
  const rows: string[][] = topics.map((topic) => {
    const cells = students.map((s) => {
      if (results === null) return "—";
      const v = results.get(`${s.id}|${topic.id}`);
      return v === undefined ? "—" : `${Math.round(v * 100)}%`;
    });
    return [topic.title, ...cells];
  });
  return toCsv(rows, headers);
}

function isTauri(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)
  );
}

/**
 * Build the CSV and save it via the Tauri save dialog + fs write. Resolves
 * with an `ExportResult` describing what happened (saved / cancelled /
 * unavailable / error) so the caller can show an inline message.
 *
 * Outside Tauri this resolves with `outcome: "unavailable"` rather than
 * throwing — the loader uses the same guard.
 */
export async function exportClassResultsCsv(
  students: ExportStudent[],
  topics: TopicT[],
  results: Map<string, number> | null,
): Promise<ExportResult> {
  if (students.length === 0 || topics.length === 0) {
    return {
      message: "Nothing to export yet — no students or no topics.",
      outcome: "error",
    };
  }
  const csv = buildClassResultsCsv(students, topics, results);

  if (!isTauri()) {
    return {
      message: "Export is only available in the desktop app.",
      outcome: "unavailable",
    };
  }
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      defaultPath: "cbclab-class-results.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (path === null) {
      return { message: null, outcome: "cancelled" };
    }
    await writeTextFile(path, csv);
    return { message: "Saved class results.", outcome: "saved" };
  } catch (err) {
    return {
      message: `Could not save: ${err instanceof Error ? err.message : String(err)}`,
      outcome: "error",
    };
  }
}
