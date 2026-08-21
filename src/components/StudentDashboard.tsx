// The current student's progress dashboard body — installed topics, summary
// counts, a "Continue where you left off" card, and a per-topic list showing
// progress state and best score.
//
// DESIGN.md voice: 17px body, Action Blue (#0066cc) links, pill CTA on the
// continue card, ≥44px touch targets, no shadows on chrome, no gradients.
// Headings use SF Pro Display with negative letter-spacing (tracking-tight).
//
// Data: progress + best scores are read from the DB in an effect (simple,
// no new deps). `best` is COMPUTED from quiz_attempts by `bestScorePerTopic`
// (never stored) — see src/db/index.ts for the canonical implementation.
//
// No comparisons, no leaderboards, no other students' data — only the current
// student's own topics. See docs/plan/06-app-features.md §"Dashboard".

import { useEffect, useState, type JSX } from "react";
import { Link } from "@tanstack/react-router";

import type { PackT, TopicT } from "@/content/schema";
import { SUBJECT_LABELS, type Subject } from "@/lib/subjects";
import {
  bestScorePerTopic,
  continueTopic,
  getProgress,
  type ProgressRow,
} from "@/db/index";
import { useStudent } from "@/lib/student-context";
import { EmptyState } from "@/components/EmptyState";

export type StudentDashboardProps = {
  studentId: number;
  packs: PackT[];
};

export function StudentDashboard({
  studentId,
  packs,
}: StudentDashboardProps): JSX.Element {
  const { student } = useStudent();
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [best, setBest] = useState<Map<string, number>>(new Map());

  // Read progress + computed best scores. Kept simple (effect + state) per the
  // three-sources rule: these are DB reads that could be TanStack Query, but
  // adding a query key here would be the only caller and there's no cache
  // sharing need yet — a local effect is the lighter choice. Cancelled on
  // unmount / studentId change so a stale write can't clobber a new student's
  // view after a fast switch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prog, scores] = await Promise.all([
        getProgress(studentId),
        bestScorePerTopic(studentId),
      ]);
      if (cancelled) return;
      setProgress(prog);
      setBest(new Map(scores.map((s) => [s.topic_id, s.best])));
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Installed topics across all packs — the universe the dashboard reasons
  // about. A topic whose pack was uninstalled is intentionally absent.
  const allTopics: TopicT[] = packs.flatMap((p) => p.topics);
  const allTopicIds = allTopics.map((t) => t.id);

  if (allTopics.length === 0) {
    return (
      <EmptyState
        title="No topics installed yet"
        message="Ask your teacher or admin to install content packs."
      />
    );
  }

  // Summary counts — over installed topics only.
  const progressByTopic = new Map(progress.map((r) => [r.topic_id, r]));
  const completed = allTopics.filter(
    (t) => progressByTopic.get(t.id)?.state === "completed",
  ).length;
  const started = allTopics.filter(
    (t) => progressByTopic.get(t.id)?.state === "started",
  ).length;
  const installed = allTopics.length;

  const continueId = continueTopic(allTopicIds, progress);
  const continueTopicObj =
    continueId != null ? allTopics.find((t) => t.id === continueId) ?? null : null;

  const name = student?.display_name ?? "You";

  return (
    <div className="flex flex-col gap-8">
      <nav className="text-[17px]">
        <Link
          to="/"
          className="text-[#0066cc] hover:underline"
          style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
        >
          Subjects
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-[40px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          Your progress
        </h1>
        <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
          {name}
        </p>
      </header>

      {/* Summary counts — a quiet stat row, no card chrome (DESIGN.md: surface
          change, not shadows, carries hierarchy). */}
      <dl className="flex flex-wrap gap-x-8 gap-y-2 font-sans text-[17px] text-[#1d1d1f]">
        <div className="flex gap-2">
          <dt className="font-semibold">{completed}</dt>
          <dd className="text-[#666666]">completed</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">{started}</dt>
          <dd className="text-[#666666]">in progress</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">{installed}</dt>
          <dd className="text-[#666666]">topics installed</dd>
        </div>
      </dl>

      {/* Continue where you left off — a prominent card with a pill CTA. */}
      {continueTopicObj ? (
        <section
          className="flex flex-col gap-4 rounded-[18px] border border-hairline bg-card px-6 py-6"
          aria-label="Continue where you left off"
        >
          <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
            Continue where you left off
          </h2>
          <p className="font-sans text-[17px] leading-relaxed text-[#1d1d1f]">
            {continueTopicObj.title}
          </p>
          <div className="flex">
            <Link
              to="/$subject/$topicId"
              params={{
                subject: continueTopicObj.subject,
                topicId: continueTopicObj.id,
              }}
              className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white hover:bg-[#0071e3]"
            >
              {progressByTopic.get(continueTopicObj.id)?.state === "started"
                ? "Resume"
                : "Start"}
            </Link>
          </div>
        </section>
      ) : (
        <section
          className="flex flex-col gap-4 rounded-[18px] border border-hairline bg-card px-6 py-6"
          aria-label="All caught up"
        >
          <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
            All caught up
          </h2>
          <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
            You’ve completed every installed topic. Take a new quiz or explore a
            subject.
          </p>
          <div className="flex">
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white hover:bg-[#0071e3]"
            >
              Browse subjects
            </Link>
          </div>
        </section>
      )}

      {/* Per-topic list — flat, one row per installed topic. Each row shows
          the title, subject label, progress state, and best score percentage
          (computed) when any attempts exist. */}
      <section className="flex flex-col gap-5" aria-label="All topics">
        <h2 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          All topics
        </h2>
        <ul className="flex flex-col gap-3">
          {allTopics.map((topic) => {
            const state = progressByTopic.get(topic.id)?.state;
            const bestFrac = best.get(topic.id);
            const hasBest = bestFrac !== undefined && bestFrac !== null;
            const pct = hasBest ? Math.round((bestFrac as number) * 100) : null;
            return (
              <li
                key={topic.id}
                className="flex flex-col gap-2 rounded-[11px] border border-hairline bg-card px-6 py-5"
              >
                <Link
                  to="/$subject/$topicId"
                  params={{ subject: topic.subject, topicId: topic.id }}
                  className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f] hover:text-[#0066cc]"
                  style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
                >
                  {topic.title}
                </Link>
                <p className="font-sans text-[14px] text-[#666666]">
                  {SUBJECT_LABELS[topic.subject as Subject]} · {topic.level}
                </p>
                <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
                  {state === "completed"
                    ? "Completed"
                    : state === "started"
                      ? "In progress"
                      : "Not started"}
                  {pct !== null ? ` · Best: ${pct}%` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
