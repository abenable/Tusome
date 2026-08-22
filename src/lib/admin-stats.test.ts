import { describe, it, expect } from "bun:test";

import type { PackT, TopicT } from "@/content/schema";
import type { ProgressWithStudent, StudentRow } from "@/db/index";
import {
  allTopics,
  classSummaries,
  overviewMetrics,
  studentSummaries,
  subjectSummaries,
  topicRows,
} from "@/lib/admin-stats";

function topic(id: string, subject: TopicT["subject"]): TopicT {
  return {
    id,
    title: id,
    subject,
    level: "S1",
    strand: "s",
    subStrand: "stub",
    outcomes: ["stub"],
    body: [{ type: "text", text: "stub" }],
  } as unknown as TopicT;
}

function pack(topics: TopicT[]): PackT {
  return {
    packId: "p",
    version: "1",
    topics,
  } as unknown as PackT;
}

function student(id: number, name: string, classLabel: string | null = null): StudentRow {
  return { id, display_name: name, class_label: classLabel, password_hash: null, created_at: "" };
}

function prog(
  studentId: number,
  topicId: string,
  state: "started" | "completed",
  updatedAt = "2024-01-01",
): ProgressWithStudent {
  return { student_id: studentId, topic_id: topicId, state, updated_at: updatedAt, display_name: "", class_label: null };
}

describe("admin-stats", () => {
  const packs = [pack([topic("t1", "physics"), topic("t2", "chemistry")])];
  const students = [student(1, "A", "S2 Blue"), student(2, "B"), student(3, "C", "S2 Blue")];
  // 6 cells total (3 students × 2 topics); 3 completed, 1 started.
  const progress: ProgressWithStudent[] = [
    prog(1, "t1", "completed"),
    prog(1, "t2", "completed"),
    prog(2, "t1", "started"),
    prog(3, "t1", "completed"),
  ];

  it("allTopics flattens packs", () => {
    expect(allTopics(packs).map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("overviewMetrics counts students/classes/topics/completion", () => {
    const m = overviewMetrics(students, progress, packs);
    expect(m.students).toBe(3);
    expect(m.classes).toBe(1); // only "S2 Blue"
    expect(m.topics).toBe(2);
    expect(m.completed).toBe(3);
    expect(m.started).toBe(1);
    expect(m.total).toBe(6);
    expect(m.rate).toBeCloseTo(0.5);
  });

  it("studentSummaries gives per-student completion", () => {
    const s = studentSummaries(students, progress, 2);
    expect(s.get(1)!.completed).toBe(2);
    expect(s.get(1)!.rate).toBe(1);
    expect(s.get(2)!.started).toBe(1);
    expect(s.get(2)!.completed).toBe(0);
    expect(s.get(3)!.completed).toBe(1);
  });

  it("classSummaries groups by label with a No-class bucket", () => {
    const c = classSummaries(students, progress, 2);
    expect(c.get("S2 Blue")!.students).toBe(2);
    expect(c.get("S2 Blue")!.completed).toBe(3); // student 1 (2) + student 3 (1)
    expect(c.get("__none__")!.students).toBe(1);
  });

  it("subjectSummaries scopes per subject", () => {
    const s = subjectSummaries(packs, 3, progress);
    expect(s.get("physics")!.topics).toBe(1);
    expect(s.get("physics")!.completed).toBe(2); // students 1 + 3
    expect(s.get("physics")!.started).toBe(1); // student 2
    expect(s.get("physics")!.rate).toBeCloseTo(2 / 3);
    expect(s.get("chemistry")!.completed).toBe(1); // student 1
  });

  it("topicRows counts per topic", () => {
    const r = topicRows(allTopics(packs), progress);
    expect(r.get("t1")!.completed).toBe(2);
    expect(r.get("t1")!.started).toBe(1);
    expect(r.get("t2")!.completed).toBe(1);
  });

  it("handles empty data without dividing by zero", () => {
    expect(overviewMetrics([], [], []).rate).toBe(0);
    expect(studentSummaries([], [], 0).size).toBe(0);
  });
});
