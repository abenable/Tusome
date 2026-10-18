// The current student's progress dashboard — summary counts, a "Continue
// where you left off" hero, earned achievements, per-subject completion rings,
// and the topics this student has opened, most recent first.
//
// Ported from the claude.ai/design project "UI design improvement request"
// (Dashboard.dc.html), using the design's own defaults for its explorer props:
// `heroStyle: "gradient"`, `progressStyle: "rings"`, `tone: "encouraging"`.
//
// Data: progress is read from the DB in an effect (simple, no new deps).
//
// Still no comparisons and no other students' data: everything here is the
// current student's own. The weekly leaderboard the owner asked for lives on
// Home only, and docs/plan/06-app-features.md:49 continues to govern this
// screen.
//
// The mock's achievements are hardcoded; these are earned or absent. A badge
// that appears for everyone regardless of what they did is decoration, and a
// student works out it means nothing within a lesson.

import { useEffect, useMemo, useState, type JSX } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

import type { PackT, TopicT } from "@/content/schema";
import {
  SUBJECTS,
  SUBJECT_ACCENTS,
  SUBJECT_ICONS,
  SUBJECT_LABELS,
  type Subject,
} from "@/lib/subjects";
import { continueTopic, getProgress, type ProgressRow } from "@/db/index";
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

  // Kept simple (effect + state): this is a DB read that could be TanStack
  // Query, but adding a query key here would be the only caller and there's no
  // cache sharing need yet. Cancelled on unmount / studentId change so a stale
  // write can't clobber a new student's view after a fast switch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prog = await getProgress(studentId);
      if (cancelled) return;
      setProgress(prog);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Installed topics across all packs — the universe the dashboard reasons
  // about. A topic whose pack was uninstalled is intentionally absent.
  const allTopics: TopicT[] = useMemo(
    () => packs.flatMap((p) => p.topics),
    [packs],
  );

  const progressByTopic = useMemo(
    () => new Map(progress.map((r) => [r.topic_id, r])),
    [progress],
  );

  if (allTopics.length === 0) {
    return (
      <EmptyState
        title="No topics installed yet"
        message="Ask your teacher or admin to install content packs."
      />
    );
  }

  const completed = allTopics.filter(
    (t) => progressByTopic.get(t.id)?.state === "completed",
  );
  const started = allTopics.filter(
    (t) => progressByTopic.get(t.id)?.state === "started",
  );

  // No progress rows at all — a brand-new profile. See the matching note in
  // routes/index.tsx: send it to the subject picker rather than an arbitrary
  // first topic.
  const isNew = progress.length === 0;

  // Topics this student has opened, in progress order (most recent first).
  // Untouched topics live on the subject pages; listing all ~75 here buried
  // the student's own work.
  const topicById = new Map(allTopics.map((t) => [t.id, t]));
  const mineTopics = progress.flatMap((r) => topicById.get(r.topic_id) ?? []);

  const continueId = continueTopic(
    allTopics.map((t) => t.id),
    progress,
  );
  const continueTopicObj =
    continueId != null ? (allTopics.find((t) => t.id === continueId) ?? null) : null;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
          Your progress
        </h1>
        {student ? (
          <p className="font-sans text-[19px] text-ink-2">
            {student.display_name}
            {student.class_label ? `, ${student.class_label}` : ""}
          </p>
        ) : null}
      </header>

      <dl className="grid grid-cols-3 gap-3">
        <StatCard n={completed.length} label="Completed" />
        <StatCard n={started.length} label="In progress" />
        <StatCard n={allTopics.length} label="Installed" />
      </dl>

      {isNew ? (
        <section
          className="flex flex-wrap items-center justify-between gap-6 rounded-card bg-sun-tint px-8 py-7"
          aria-label="Get started"
        >
          <div>
            <h2 className="mb-1 font-heading text-[27px] font-extrabold tracking-[-0.01em] text-ink">
              Nothing here yet
            </h2>
            <p className="font-sans text-[17px] text-ink-2">
              Open a topic and your progress will show up here.
            </p>
          </div>
          <Link
            to="/subjects"
            className="inline-flex min-h-[52px] shrink-0 items-center gap-2 rounded-full bg-sun px-7 font-sans text-[18px] font-bold text-ink transition hover:bg-sun-hover active:scale-[0.98]"
          >
            Choose a subject
            <ArrowRight size={18} aria-hidden />
          </Link>
        </section>
      ) : continueTopicObj ? (
        <ContinueHero
          topic={continueTopicObj}
          resuming={
            progressByTopic.get(continueTopicObj.id)?.state === "started"
          }
        />
      ) : (
        <section
          className="flex flex-wrap items-center justify-between gap-6 rounded-card bg-sun-tint px-8 py-7"
          aria-label="All caught up"
        >
          <div>
            <h2 className="mb-1 font-heading text-[27px] font-extrabold tracking-[-0.01em] text-ink">
              All caught up
            </h2>
            <p className="font-sans text-[17px] text-ink-2">
              You’ve completed every installed topic.
            </p>
          </div>
          <Link
            to="/subjects"
            className="inline-flex min-h-[48px] shrink-0 items-center rounded-full bg-brand px-6 font-sans text-[17px] font-bold text-white transition hover:bg-brand-hover active:scale-[0.98]"
          >
            Browse subjects
          </Link>
        </section>
      )}

      <Achievements
        // Oldest completion first: progress is most-recent-first, so the
        // reversed order makes `completed[0]` the student's first finish.
        completed={[...mineTopics]
          .reverse()
          .filter((t) => progressByTopic.get(t.id)?.state === "completed")}
        startedOrDone={[...completed, ...started]}
      />

      <section aria-label="By subject">
        <h2 className="mb-4 font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink">
          By subject
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SUBJECTS.map((subject) => {
            const mine = allTopics.filter((t) => t.subject === subject);
            const done = mine.filter(
              (t) => progressByTopic.get(t.id)?.state === "completed",
            ).length;
            return (
              <SubjectRing
                key={subject}
                subject={subject}
                done={done}
                total={mine.length}
              />
            );
          })}
        </div>
      </section>

      {mineTopics.length > 0 ? (
      <section aria-label="Your topics">
        <h2 className="mb-4 font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink">
          Your topics
        </h2>
        <ul className="flex flex-col gap-2">
          {mineTopics.map((topic) => {
            const subject = topic.subject as Subject;
            const accent = SUBJECT_ACCENTS[subject];
            const Icon = SUBJECT_ICONS[subject];
            const state = progressByTopic.get(topic.id)?.state;
            return (
              <li key={topic.id}>
                <Link
                  to="/$subject/$topicId"
                  params={{ subject: topic.subject, topicId: topic.id }}
                  className="flex flex-wrap items-center gap-[14px] rounded-card border border-line bg-surface px-5 py-[14px] transition hover:shadow-card"
                >
                  <span
                    className={`flex size-[34px] shrink-0 items-center justify-center rounded-tile ${accent.bg}`}
                  >
                    <Icon size={17} className="text-white" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-sans text-[18px] font-bold text-ink">
                      {topic.title}
                    </span>
                    <span className="font-sans text-[15px] text-ink-3">
                      {SUBJECT_LABELS[subject]}, {topic.level}
                    </span>
                  </span>
                  <span
                    className={`inline-flex min-h-[28px] items-center gap-1 rounded-full px-3 font-sans text-[14px] font-bold ${
                      state === "completed"
                        ? `${accent.bg} text-white`
                        : `${accent.tint} ${accent.text}`
                    }`}
                  >
                    {state === "completed" ? (
                      <>
                        <Check size={14} strokeWidth={3} aria-hidden />
                        Completed
                      </>
                    ) : (
                      "In progress"
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      ) : null}
    </div>
  );
}

function StatCard({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 py-[18px]">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block font-heading text-[34px] font-extrabold leading-tight tabular-nums text-ink">
          {n}
        </span>
        <span className="block font-sans text-[15px] font-semibold text-ink-3">
          {label}
        </span>
      </dd>
    </div>
  );
}

/**
 * The gradient "continue" band. The gradient is built from the topic's own
 * subject token, so resuming a chemistry topic reads green rather than always
 * physics blue as in the mock.
 */
export function ContinueHero({
  topic,
  resuming,
}: {
  topic: TopicT;
  resuming: boolean;
}) {
  const subject = topic.subject as Subject;
  const accent = SUBJECT_ACCENTS[subject];
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-6 rounded-card px-8 py-8"
      style={{
        backgroundImage: `linear-gradient(135deg, var(--color-${subject}), color-mix(in oklch, var(--color-${subject}) 80%, black))`,
      }}
      aria-label="Continue where you left off"
    >
      <div>
        <p className="mb-2 font-sans text-[16px] font-bold text-white/80">
          {resuming ? "Continue where you left off" : "Up next"}
        </p>
        <h2 className="mb-1 font-heading text-[30px] font-extrabold leading-tight tracking-[-0.01em] text-white">
          {topic.title}
        </h2>
        <p className="font-sans text-[17px] text-white/85">
          {SUBJECT_LABELS[subject]}, {topic.level}
        </p>
      </div>
      <Link
        to="/$subject/$topicId"
        params={{ subject: topic.subject, topicId: topic.id }}
        className={`inline-flex min-h-[52px] shrink-0 items-center gap-2 rounded-full bg-surface px-7 font-sans text-[18px] font-extrabold transition hover:bg-white active:scale-[0.98] ${accent.text}`}
      >
        {resuming ? "Resume" : "Start"}
        <ArrowRight size={18} aria-hidden />
      </Link>
    </section>
  );
}

/**
 * Earned achievements only. Each is computed from data the app already stores,
 * and the section disappears entirely when none are earned rather than showing
 * empty placeholders.
 */
function Achievements({
  completed,
  startedOrDone,
}: {
  completed: TopicT[];
  startedOrDone: TopicT[];
}) {
  const first = completed[0] ?? null;
  const subjectsTouched = new Set(startedOrDone.map((t) => t.subject));

  const badges: JSX.Element[] = [];
  if (first) {
    const accent = SUBJECT_ACCENTS[first.subject as Subject];
    badges.push(
      <Badge
        key="first"
        chip={
          <span className={`${accent.bg} ${CHIP} text-white`}>
            <Check size={18} strokeWidth={3} aria-hidden />
          </span>
        }
        title="First topic done"
        subtitle={first.title}
      />,
    );
  }
  if (subjectsTouched.size >= 2) {
    badges.push(
      <Badge
        key="multi"
        chip={
          <span className={`${CHIP} border-2 border-line bg-canvas text-ink-3`}>
            {subjectsTouched.size}
          </span>
        }
        title="Multi-subject learner"
        subtitle={`Started ${subjectsTouched.size} of ${SUBJECTS.length} subjects`}
      />,
    );
  }

  if (badges.length === 0) return null;

  return (
    <section aria-label="Achievements">
      <h2 className="mb-4 font-heading text-[25px] font-extrabold tracking-[-0.01em] text-ink">
        Achievements
      </h2>
      <div className="flex flex-wrap gap-[14px]">{badges}</div>
    </section>
  );
}

const CHIP =
  "flex size-[38px] shrink-0 items-center justify-center rounded-full font-heading text-[17px] font-extrabold";

function Badge({
  chip,
  title,
  subtitle,
}: {
  chip: JSX.Element;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-[18px] py-3">
      {chip}
      <div>
        <p className="font-sans text-[16px] font-bold text-ink">{title}</p>
        <p className="font-sans text-[14px] text-ink-3">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Per-subject completion ring. Announced as text — a conic gradient is
 * invisible to a screen reader and colour alone can't carry the number.
 */
function SubjectRing({
  subject,
  done,
  total,
}: {
  subject: Subject;
  done: number;
  total: number;
}) {
  const accent = SUBJECT_ACCENTS[subject];
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const track = "var(--color-line)";
  const fill = pct === 0 ? track : `var(--color-${subject})`;
  return (
    <div className="flex flex-col items-center gap-[10px] rounded-card border border-line bg-surface p-[18px] text-center">
      <div
        className="flex size-14 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${fill} ${pct}%, ${track} 0)` }}
        role="img"
        aria-label={`${SUBJECT_LABELS[subject]} ${pct}% complete, ${done} of ${total} topics`}
      >
        <span
          className={`flex size-[42px] items-center justify-center rounded-full bg-surface font-sans text-[14px] font-extrabold ${
            pct === 0 ? "text-ink-3" : accent.text
          }`}
          aria-hidden
        >
          {pct}%
        </span>
      </div>
      <span className="font-sans text-[16px] font-bold text-ink">
        {SUBJECT_LABELS[subject]}
      </span>
      <span className="font-sans text-[14px] tabular-nums text-ink-3">
        {done} of {total} done
      </span>
    </div>
  );
}
