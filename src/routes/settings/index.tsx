// Admin Overview — `/settings`. A real metrics dashboard: a row of metric
// cards (students, classes, topics), a per-subject band of cards with
// completion rings, a recent-activity feed, and a leaderboard ranking
// students by topics completed. This replaces the legacy single-page
// AdminPanel on this route.
//
// Data: packs come from the cached loader; students + all progress are read
// in an effect (same shape Home uses) and shaped by the pure helpers in
// src/lib/admin-stats.ts.

import { useEffect, useState, type JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Trophy, Users } from "lucide-react";

import { loadPacksWithErrors } from "@/content/loader";
import type { PackT } from "@/content/schema";
import { getAllProgress, getStudents } from "@/db/index";
import type { ProgressWithStudent, StudentRow } from "@/db/index";
import { SUBJECTS, SUBJECT_ICONS, SUBJECT_LABELS, SUBJECT_ACCENTS } from "@/lib/subjects";
import { formatDbTime } from "@/lib/utils";
import {
  allTopics,
  classLabelOf,
  overviewMetrics,
  studentSummaries,
  subjectSummaries,
} from "@/lib/admin-stats";
import { MetricCard, SectionCard } from "@/components/admin/primitives";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/settings/")({
  loader: async ({ context }): Promise<{
    packs: PackT[];
    errors: Array<{ path: string; error: string }>;
  }> => {
    return loadPacksWithErrors(context.queryClient);
  },
  component: OverviewPage,
});

function OverviewPage(): JSX.Element {
  const { packs, errors } = Route.useLoaderData();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [allProgress, setProgress] = useState<ProgressWithStudent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, p] = await Promise.all([getStudents(), getAllProgress()]);
        if (cancelled) return;
        setStudents(s);
        setProgress(p);
      } catch (err) {
        console.error("[Overview] load failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p role="alert" className="font-sans text-[18px] text-bad">
        Couldn’t read student data on this computer.
      </p>
    );
  }
  if (!students || !allProgress) {
    return <p className="font-sans text-[18px] text-ink-3">Loading…</p>;
  }

  const topics = allTopics(packs);
  // Only progress on installed topics counts: a removed pack's rows would
  // otherwise push completion past 100% (the denominators are installed
  // topics).
  const installed = new Set(topics.map((t) => t.id));
  const progress = allProgress.filter((p) => installed.has(p.topic_id));
  const titleOf = new Map(topics.map((t) => [t.id, t.title]));
  const m = overviewMetrics(students, progress, packs);
  const subjects = subjectSummaries(packs, students.length, progress);
  const recent = progress.slice(0, 12);

  // Ranked by topics completed (ties broken by topics started, then name) —
  // the only signal available now that quiz scores are gone.
  const leaders = [...studentSummaries(students, progress, topics.length).entries()]
    .map(([id, sum]) => ({
      student: students.find((s) => s.id === id)!,
      ...sum,
    }))
    .sort(
      (a, b) =>
        b.completed - a.completed ||
        b.started - a.started ||
        a.student.display_name.localeCompare(b.student.display_name),
    )
    .slice(0, 5);

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      {/* Metrics row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Students" value={m.students} />
        <MetricCard label="Classes" value={m.classes} />
        <MetricCard label="Topics" value={m.topics} />
      </div>

      {/* Subjects band */}
      <SectionCard icon={BookOpen} title="Subjects" count={SUBJECTS.length} ariaLabel="Subjects overview">
        {topics.length === 0 ? (
          <p className="font-sans text-[18px] text-ink-3">No content installed.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SUBJECTS.map((s) => {
              const sum = subjects.get(s) ?? {
                total: 0,
                started: 0,
                completed: 0,
                rate: 0,
                students: 0,
                topics: 0,
              };
              const Icon = SUBJECT_ICONS[s];
              const accent = SUBJECT_ACCENTS[s];
              return (
                <div
                  key={s}
                  className="flex flex-col gap-3 rounded-tile border border-line bg-canvas p-5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-tile ${accent.bg}`}
                    >
                      <Icon size={18} className="text-white" aria-hidden />
                    </span>
                    <div className="flex flex-col">
                      <span className="font-sans text-[17px] font-bold text-ink">
                        {SUBJECT_LABELS[s]}
                      </span>
                      <span className="font-sans text-[15px] tabular-nums text-ink-3">
                        {sum.topics} {sum.topics === 1 ? "topic" : "topics"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Recent activity */}
      <SectionCard icon={Users} title="Recent activity" ariaLabel="Recent activity">
        {recent.length === 0 ? (
          <p className="font-sans text-[18px] text-ink-3">No activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((p) => (
              <li
                key={`${p.student_id}-${p.topic_id}-${p.updated_at}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-line-soft bg-canvas px-4 py-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sun font-heading text-[14px] font-bold text-ink">
                  {p.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-sans text-[17px] font-bold text-ink">
                  {p.display_name}
                </span>
                {p.class_label ? (
                  <span className="font-sans text-[15px] text-ink-3">
                    {classLabelOf(p.class_label)}
                  </span>
                ) : null}
                <span className="font-sans text-[16px] text-ink-2">
                  {p.state === "completed" ? "completed" : "started"}{" "}
                  {titleOf.get(p.topic_id) ?? p.topic_id}
                </span>
                <span className="ml-auto font-sans text-[14px] tabular-nums text-ink-3">
                  {formatDbTime(p.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Leaderboard — ranked by topics completed (students mark a topic
          complete at the end of its lesson). */}
      <SectionCard icon={Trophy} title="Leaderboard" count={leaders.length} ariaLabel="Student leaderboard">
        {leaders.length === 0 ? (
          <p className="font-sans text-[18px] text-ink-3">
            No students yet. Add students on the Students page.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {leaders.map((row, i) => (
              <li
                key={row.student.id}
                className="flex flex-wrap items-center gap-3 rounded-tile border border-line-soft bg-canvas px-4 py-2.5"
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full font-sans text-[14px] font-bold ${
                    i === 0 ? "bg-sun text-ink" : "bg-side text-white"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="font-sans text-[17px] font-bold text-ink">
                  {row.student.display_name}
                </span>
                {row.student.class_label ? (
                  <span className="font-sans text-[15px] text-ink-3">
                    {classLabelOf(row.student.class_label)}
                  </span>
                ) : null}
                <span className="ml-auto font-sans text-[16px] font-bold tabular-nums text-ink">
                  {row.completed}
                </span>
                <span className="font-sans text-[14px] text-ink-3">completed</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Pack validation is surfaced here too because it's the thing an admin
          glances at first on a broken install. Full detail is on the
          Subjects page. */}
      {errors.length > 0 ? (
        <ComingSoon
          title="Content validation"
          note={`${errors.length} ${errors.length === 1 ? "pack" : "packs"} failed validation. See the Subjects page for details.`}
        />
      ) : null}
    </div>
  );
}
