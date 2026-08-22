// Pure admin analytics — grouping/aggregation over students + progress + the
// topic catalog from content packs. No DB, no React: every function here is
// pure so it is unit-testable without sqlite. The DB layer
// (src/db/index.ts getAllProgress / getStudents) supplies the flat rows; this
// module shapes them into the per-student / per-class / per-subject / per-topic
// summaries the admin pages render.
//
// The only tracking signal is `progress.state` ("started" | "completed") — the
// quiz engine was removed, so there are no scores. "Completion rate" is the
// fraction of (student × topic) cells in the "completed" state.

import type { PackT, TopicT } from "@/content/schema";
import type { ProgressWithStudent, StudentRow } from "@/db/index";
import { SUBJECTS, SUBJECT_LABELS, type Subject } from "@/lib/subjects";

/** All topics across all packs, in pack order. */
export function allTopics(packs: PackT[]): TopicT[] {
  return packs.flatMap((p) => p.topics);
}

export type Summary = {
  /** Max possible (student × topic) cells this scope covers. */
  total: number;
  started: number;
  completed: number;
  /** Fraction of `total` that is completed, 0..1 (0 when total is 0). */
  rate: number;
  /** Students in this scope (for class/subject/overview summaries). */
  students: number;
};

function empty(total = 0, students = 0): Summary {
  return { total, started: 0, completed: 0, rate: 0, students };
}

function rate(s: Summary): number {
  return s.total > 0 ? s.completed / s.total : 0;
}

/** Count a single progress row into a summary's started/completed. */
function count(s: Summary, state: string): void {
  if (state === "completed") s.completed++;
  else if (state === "started") s.started++;
}

/** Per-student summary keyed by student id. `topicCount` is the denominator. */
export function studentSummaries(
  students: StudentRow[],
  allProgress: ProgressWithStudent[],
  topicCount: number,
): Map<number, Summary> {
  const map = new Map<number, Summary>();
  for (const s of students) {
    map.set(s.id, empty(topicCount, 1));
  }
  let lastActive = new Map<number, string>();
  for (const p of allProgress) {
    const s = map.get(p.student_id);
    if (!s) continue;
    count(s, p.state);
    const prev = lastActive.get(p.student_id);
    if (!prev || p.updated_at > prev) lastActive.set(p.student_id, p.updated_at);
  }
  for (const [, s] of map) s.rate = rate(s);
  return map;
}

/** A student's last activity timestamp (ISO), or null. */
export function lastActiveFor(
  studentId: number,
  allProgress: ProgressWithStudent[],
): string | null {
  // allProgress is DESC by updated_at from the DB, so the first match wins.
  for (const p of allProgress) {
    if (p.student_id === studentId) return p.updated_at;
  }
  return null;
}

/** Per-class summary keyed by class label, plus an "__none__" bucket for
 *  students with no class_label. */
export function classSummaries(
  students: StudentRow[],
  allProgress: ProgressWithStudent[],
  topicCount: number,
): Map<string, Summary> {
  const map = new Map<string, Summary>();
  const bucket = (label: string) => {
    let s = map.get(label);
    if (!s) {
      s = empty(0, 0);
      map.set(label, s);
    }
    return s;
  };
  const NONE = "__none__";
  for (const st of students) {
    const label = st.class_label ?? NONE;
    const s = bucket(label);
    s.students++;
    s.total += topicCount;
  }
  for (const p of allProgress) {
    const st = students.find((x) => x.id === p.student_id);
    const label = st?.class_label ?? NONE;
    const s = bucket(label);
    count(s, p.state);
  }
  for (const s of map.values()) s.rate = rate(s);
  return map;
}

/** Per-subject summary keyed by Subject. The denominator is
 *  (studentCount × subjectTopicCount). */
export function subjectSummaries(
  packs: PackT[],
  studentCount: number,
  allProgress: ProgressWithStudent[],
): Map<Subject, Summary & { topics: number }> {
  const topicToSubject = new Map<string, Subject>();
  const topicsPerSubject = new Map<Subject, number>();
  for (const t of allTopics(packs)) {
    topicToSubject.set(t.id, t.subject as Subject);
    topicsPerSubject.set(
      t.subject as Subject,
      (topicsPerSubject.get(t.subject as Subject) ?? 0) + 1,
    );
  }
  const map = new Map<Subject, Summary & { topics: number }>();
  for (const s of SUBJECTS) {
    const topics = topicsPerSubject.get(s) ?? 0;
    map.set(s, {
      ...empty(studentCount * topics, studentCount),
      topics,
    });
  }
  for (const p of allProgress) {
    const subj = topicToSubject.get(p.topic_id);
    if (!subj) continue;
    const s = map.get(subj);
    if (!s) continue;
    count(s, p.state);
  }
  for (const s of map.values()) s.rate = rate(s);
  return map;
}

/** Per-topic started/completed counts across all students. */
export function topicRows(
  topics: TopicT[],
  allProgress: ProgressWithStudent[],
): Map<string, Summary> {
  const map = new Map<string, Summary>();
  for (const t of topics) map.set(t.id, empty(0, 0));
  for (const p of allProgress) {
    const s = map.get(p.topic_id);
    if (!s) continue;
    count(s, p.state);
  }
  for (const s of map.values()) s.rate = rate(s);
  return map;
}

/** Overview totals across the whole install. */
export function overviewMetrics(
  students: StudentRow[],
  allProgress: ProgressWithStudent[],
  packs: PackT[],
): Summary & {
  classes: number;
  topics: number;
  packs: number;
} {
  const topicCount = allTopics(packs).length;
  const total = students.length * topicCount;
  const s = empty(total, students.length);
  for (const p of allProgress) count(s, p.state);
  s.rate = rate(s);
  const classes = new Set(
    students.map((x) => x.class_label).filter((x): x is string => !!x),
  ).size;
  return {
    ...s,
    classes,
    topics: topicCount,
    packs: packs.length,
  };
}

/** The label for a class bucket key ("__none__" → readable). */
export function classLabelOf(key: string): string {
  return key === "__none__" ? "No class" : key;
}

export { SUBJECTS, SUBJECT_LABELS };
