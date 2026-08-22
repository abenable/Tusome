// Teacher dashboard (W6) — a PIN-gated class view behind the admin speed-bump.
//
// What it shows, once unlocked:
//   - A class table: rows = topics from installed packs, cols = students. Each
//     cell is the best score FRACTION for that (student, topic) computed by
//     `classResults()` (MAX(score*1.0/max_score) GROUP BY student_id, topic_id)
//     — never a stored column. "—" means no attempts. A real <table> with
//     <thead>/<tbody>/<th scope> for semantics + projector-distance readability.
//   - Click a cell → fetch that student's attempts on that topic
//     (`getAttemptsForStudentTopic`) and reveal the <QuestionBreakdown> drawer,
//     which reconstructs the exact question/option order each student saw from
//     the persisted seed.
//   - "Export class results to CSV": builds the same grid as a CSV (UTF-8 BOM,
//     CRLF, all fields quoted — opens clean in Excel) via `toCsv`, then uses
//     the Tauri save dialog + a Rust `write_text_file` command (no broad fs
//     scope). Guarded so it no-ops cleanly outside Tauri (bun test / plain
//     browser).
//
// DESIGN.md: 17px body, single Action Blue #0066cc, pill CTAs, ≥44px targets,
// no shadows on chrome, no gradients, no second brand color. The whole thing
// is gated by <PinGate> (reused from W2 — no new gate).
//
// No student passwords, no comparisons framing — it's a teacher's class table.

import { useEffect, useState, type JSX } from "react";

import type { PackT, TopicT } from "@/content/schema";
import { SUBJECT_ACCENTS, SUBJECT_LABELS, type Subject } from "@/lib/subjects";
import {
  classResults,
  getAttemptsForStudentTopic,
  type QuizAttemptRow,
} from "@/db/index";
import { useStudent } from "@/lib/student-context";
import { toCsv } from "@/lib/csv";
import { EmptyState } from "@/components/EmptyState";
import { PinGate } from "@/components/PinGate";
import { QuestionBreakdown } from "@/components/QuestionBreakdown";

export type TeacherDashboardProps = {
  packs: PackT[];
};

export function TeacherDashboard({ packs }: TeacherDashboardProps): JSX.Element {
  // The whole teacher surface is PIN-gated. PinGate is reused verbatim from W2;
  // it bootstraps a PIN on first run and has a 3-try→30s cooldown speed-bump.
  // Its render-prop hands us `unlocked`; we render the class table only then.
  return (
    <PinGate aria-label="Teacher view">
      {(unlocked) =>
        unlocked ? (
          <ClassTable packs={packs} />
        ) : (
          // While the gate shows its own PIN form, there's nothing else here.
          null
        )
      }
    </PinGate>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Class table — the actual teacher content, rendered once the PIN is open.
// ──────────────────────────────────────────────────────────────────────────

function ClassTable({ packs }: { packs: PackT[] }): JSX.Element {
  const { students } = useStudent();
  const [results, setResults] = useState<
    Map<string, number> | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The (student, topic) → best-fraction lookup, keyed "studentId|topicId".
  // Kept in a Map for O(1) cell lookups across the grid. Re-read on mount and
  // whenever the students list changes (a new student has no row until they
  // attempt something, so this also picks up a freshly-added student's first
  // attempts after they take a quiz).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const rows = await classResults();
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const r of rows) {
          m.set(`${r.student_id}|${r.topic_id}`, r.best);
        }
        setResults(m);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not load class results.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-question breakdown state: which (student, topic) cell is selected,
  // and that cell's attempts (loaded on demand).
  const [selected, setSelected] = useState<
    { studentId: number; topicId: string } | null
  >(null);
  const [attempts, setAttempts] = useState<QuizAttemptRow[] | null>(null);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const allTopics: TopicT[] = packs.flatMap((p) => p.topics);

  // Empty states take precedence over the grid.
  if (students.length === 0) {
    return (
      <EmptyState
        title="No students yet"
        message="Add students from the profile picker to see a class table."
      />
    );
  }
  if (allTopics.length === 0) {
    return (
      <EmptyState
        title="No topics installed yet"
        message="Install content packs to build a class table."
      />
    );
  }

  // Load the selected cell's attempts when the selection changes.
  useEffect(() => {
    if (selected === null) {
      setAttempts(null);
      setAttemptsError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAttemptsError(null);
      try {
        const rows = await getAttemptsForStudentTopic(
          selected.studentId,
          selected.topicId,
        );
        if (cancelled) return;
        setAttempts(rows);
      } catch (err) {
        if (cancelled) return;
        setAttemptsError(
          err instanceof Error ? err.message : "Could not load attempts.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const selectedTopic =
    selected !== null
      ? allTopics.find((t) => t.id === selected.topicId) ?? null
      : null;

  function cellPct(studentId: number, topicId: string): string {
    if (results === null) return "";
    const v = results.get(`${studentId}|${topicId}`);
    if (v === undefined) return "—";
    return `${Math.round(v * 100)}%`;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* The design puts the export CTA on the header's right edge. ExportBar
          owns the dialog + its own confirmation state, so it sits beside the
          heading rather than being reimplemented inline. */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="mb-[6px] font-heading text-[34px] font-extrabold tracking-[-0.02em] text-ink">
            Class results
          </h1>
          <p className="max-w-[480px] font-sans text-[16px] leading-[1.5] text-ink-2">
            Best score per student per topic. Select a cell to see a
            per-question breakdown.
          </p>
        </div>
      </header>

      <ExportBar
        students={students}
        topics={allTopics}
        results={results}
        onDone={(msg) => {
          // Inline confirmation is shown via the ExportBar's own state; this
          // callback is a hook for future logging, kept minimal here.
          void msg;
        }}
      />

      {loadError ? (
        <p role="alert" className="font-sans text-[17px] text-ink">
          Could not load class results: {loadError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full border-collapse font-sans text-[15px] text-ink">
          <thead>
            <tr className="bg-canvas text-left">
              <th
                scope="col"
                className="min-w-[220px] px-[18px] py-[14px] font-extrabold"
              >
                Topic
              </th>
              {students.map((s) => (
                <th
                  key={s.id}
                  scope="col"
                  className="min-w-[110px] px-[18px] py-[14px] font-extrabold"
                >
                  {s.display_name}
                  {s.class_label ? (
                    <span className="block font-sans text-[12px] font-medium text-ink-3">
                      {s.class_label}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allTopics.map((topic) => (
              <tr key={topic.id} className="border-t border-line">
                <th scope="row" className="px-[18px] py-3 text-left font-bold">
                  <span className="text-ink">{topic.title}</span>
                  <span className="block text-[12px] font-medium text-ink-3">
                    {SUBJECT_LABELS[topic.subject as Subject]} · {topic.level}
                  </span>
                </th>
                {students.map((s) => {
                  const isSel =
                    selected !== null &&
                    selected.studentId === s.id &&
                    selected.topicId === topic.id;
                  const pct = cellPct(s.id, topic.id);
                  return (
                    <td key={s.id} className="px-[18px] py-2 align-top">
                      <button
                        type="button"
                        onClick={() =>
                          setSelected(
                            isSel
                              ? null
                              : { studentId: s.id, topicId: topic.id },
                          )
                        }
                        aria-pressed={isSel}
                        aria-label={`${topic.title}, ${s.display_name}: ${pct}`}
                        // The mock's chip is 36px tall; this keeps 44 so the
                        // cell stays a valid touch target (06-app-features
                        // §Accessibility). Colour follows the topic's subject,
                        // so a teacher can scan one subject down the column.
                        className={
                          "inline-flex min-h-[44px] min-w-[56px] items-center justify-center rounded-[10px] px-3 font-sans text-[14px] font-bold transition active:scale-95 " +
                          (isSel
                            ? `${SUBJECT_ACCENTS[topic.subject as Subject].bg} text-white`
                            : pct === "—"
                              ? "font-normal text-ink-3 hover:bg-canvas"
                              : `${SUBJECT_ACCENTS[topic.subject as Subject].tint} ${SUBJECT_ACCENTS[topic.subject as Subject].text}`)
                        }
                      >
                        {results === null ? "…" : pct}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected !== null && selectedTopic !== null ? (
        <section
          className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface px-5 py-5"
          aria-label="Per-question breakdown"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-[21px] font-semibold tracking-tight text-ink">
              {selectedTopic.title}
            </h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex min-h-[44px] items-center rounded-[8px] px-3 font-sans text-[14px] text-brand hover:underline"
            >
              Close
            </button>
          </div>
          {attemptsError ? (
            <p role="alert" className="font-sans text-[17px] text-ink">
              Could not load attempts: {attemptsError}
            </p>
          ) : attempts === null ? (
            <p className="font-sans text-[17px] text-ink-3">Loading…</p>
          ) : (
            <QuestionBreakdown
              topic={selectedTopic}
              studentId={selected.studentId}
              attempts={attempts}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Export bar — build the CSV from the current grid, save via Tauri dialog + fs.
// ──────────────────────────────────────────────────────────────────────────

function ExportBar({
  students,
  topics,
  results,
  onDone,
}: {
  students: { id: number; display_name: string; class_label: string | null }[];
  topics: TopicT[];
  results: Map<string, number> | null;
  onDone: (message: string) => void;
}): JSX.Element {
  const [status, setStatus] = useState<string | null>(null);

  async function handleExport() {
    // Build the CSV matrix: header = student names; each row = a topic with
    // its best-score cells. Empty cells render as "—" (matches the on-screen
    // grid). The CSV builder handles BOM/CRLF/quoting.
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
    const csv = toCsv(rows, headers);

    // Save dialog + fs write. Guard: outside Tauri (bun test, plain browser)
    // the dialog API is unavailable — we surface a clear message rather than
    // crashing. The "isTauri" check mirrors src/content/loader.ts.
    const inTauri =
      typeof globalThis !== "undefined" &&
      "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>);
    if (!inTauri) {
      setStatus("Export is only available in the desktop app.");
      onDone("unavailable");
      return;
    }
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await save({
        defaultPath: "cbclab-class-results.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (path === null) {
        // User cancelled the dialog — not an error, just clear the message.
        setStatus(null);
        onDone("cancelled");
        return;
      }
      // File write via the Rust `write_text_file` command (no broad fs scope;
      // the Rust side validates the user-chosen path against its allowed dirs).
      await invoke("write_text_file", { path, contents: csv });
      setStatus("Saved class results.");
      onDone("saved");
    } catch (err) {
      setStatus(
        `Could not save: ${err instanceof Error ? err.message : String(err)}`,
      );
      onDone("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={handleExport}
        className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-brand px-6 text-[17px] text-white transition active:scale-95 hover:bg-brand-hover"
      >
        Export class results to CSV
      </button>
      {status ? (
        <p className="font-sans text-[17px] leading-relaxed text-ink-2">
          {status}
        </p>
      ) : null}
    </div>
  );
}
