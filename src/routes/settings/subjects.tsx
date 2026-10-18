// Subjects — `/settings/subjects`. Per-subject coverage. Content is read-only
// from installed packs; this page tracks, it does not author. Click a subject
// card to scope the topic table below it to that subject (Topic/Level/Strand
// only — no per-topic started/done counts, no installed-packs list).

import { useEffect, useMemo, useState, type JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { loadPacksCached } from "@/content/loader";
import type { PackT } from "@/content/schema";
import { getAllProgress } from "@/db/index";
import type { ProgressWithStudent } from "@/db/index";
import { getStudents } from "@/db/index";
import {
  SUBJECTS,
  SUBJECT_ICONS,
  SUBJECT_LABELS,
  SUBJECT_ACCENTS,
  type Subject,
} from "@/lib/subjects";
import { allTopics, subjectSummaries, topicRows } from "@/lib/admin-stats";
import { SectionCard } from "@/components/admin/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/settings/subjects")({
  loader: async ({ context }): Promise<{ packs: PackT[] }> => {
    const { packs } = await loadPacksCached(context.queryClient);
    return { packs };
  },
  component: SubjectsPage,
});

function SubjectsPage(): JSX.Element {
  const { packs } = Route.useLoaderData();
  const [progress, setProgress] = useState<ProgressWithStudent[] | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [subject, setSubject] = useState<Subject>(
    (SUBJECTS[0] as Subject) ?? "physics",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [p, students] = await Promise.all([getAllProgress(), getStudents()]);
        if (cancelled) return;
        setProgress(p);
        setStudentCount(students.length);
      } catch (err) {
        // The topic table still renders from installed packs; counts read 0.
        console.error("[Subjects] load failed:", err);
        if (!cancelled) setProgress([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = useMemo(
    () => (progress ? subjectSummaries(packs, studentCount, progress) : null),
    [packs, studentCount, progress],
  );

  const topics = useMemo(() => allTopics(packs).filter((t) => t.subject === subject), [packs, subject]);
  const rows = useMemo(
    () => (progress ? topicRows(topics, progress) : null),
    [topics, progress],
  );

  const Icon = SUBJECT_ICONS[subject];
  const accent = SUBJECT_ACCENTS[subject];
  const sum = subjects?.get(subject);

  if (!subjects || !rows) return <p className="font-sans text-[18px] text-ink-3">Loading…</p>;

  return (
    <div className="flex flex-col gap-6">
      {/* Subject cards row */}
      <SectionCard icon={BookOpen} title="Subjects" count={SUBJECTS.length} ariaLabel="Subjects">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUBJECTS.map((s) => {
            const s2 = subjects.get(s) ?? { rate: 0, topics: 0, completed: 0, students: 0 } as any;
            const SIcon = SUBJECT_ICONS[s];
            const a = SUBJECT_ACCENTS[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSubject(s)}
                aria-pressed={subject === s}
                className={`flex flex-col gap-3 rounded-tile border p-5 text-left transition ${
                  subject === s
                    ? `${a.border} ${a.tint}`
                    : "border-line bg-canvas hover:bg-surface"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-tile ${a.bg}`}>
                    <SIcon size={18} className="text-white" aria-hidden />
                  </span>
                  <div className="flex flex-col">
                    <span className="font-sans text-[17px] font-bold text-ink">
                      {SUBJECT_LABELS[s]}
                    </span>
                    <span className="font-sans text-[15px] tabular-nums text-ink-3">
                      {s2.topics} {s2.topics === 1 ? "topic" : "topics"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Selected subject topic table */}
      <SectionCard
        icon={Icon}
        title={`${SUBJECT_LABELS[subject]} topics`}
        count={topics.length}
        ariaLabel={`${SUBJECT_LABELS[subject]} topic breakdown`}
      >
        <div className={`flex items-center gap-4 rounded-tile ${accent.tint} px-5 py-4`}>
          <div className="flex flex-col">
            <span className="font-sans text-[17px] font-bold text-ink">
              {sum?.completed ?? 0} completed
            </span>
            <span className="font-sans text-[15px] text-ink-2">
              {sum?.students ?? 0} {sum?.students === 1 ? "student" : "students"},{" "}
              {sum?.topics ?? 0} {sum?.topics === 1 ? "topic" : "topics"}
            </span>
          </div>
        </div>

        {topics.length === 0 ? (
          <p className="font-sans text-[18px] text-ink-3">
            No topics installed for {SUBJECT_LABELS[subject]}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-sans text-[15px] font-bold text-ink-3">Topic</TableHead>
                  <TableHead className="font-sans text-[15px] font-bold text-ink-3">Level</TableHead>
                  <TableHead className="font-sans text-[15px] font-bold text-ink-3">Strand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topics.map((t) => {
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-sans text-[17px] font-semibold text-ink">
                        {t.title}
                      </TableCell>
                      <TableCell className="font-sans text-[16px] text-ink-2">{t.level}</TableCell>
                      <TableCell className="font-sans text-[16px] text-ink-2">{t.strand}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
