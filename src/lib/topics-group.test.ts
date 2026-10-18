import { describe, it, expect } from "bun:test";

import type { TopicT } from "@/content/schema";
import {
  currentTerm,
  groupTopicsByLevelThenTerm,
  topicsInTeachingOrder,
} from "@/lib/topics-group";

// Grouping only reads id, title, level, term and order, so stub the rest.
function topic(
  id: string,
  level: TopicT["level"],
  term?: 1 | 2 | 3,
  order?: number,
): TopicT {
  return {
    id,
    title: id,
    subject: "physics",
    level,
    term,
    order,
    strand: "stub",
    subStrand: "stub",
    outcomes: ["stub"],
    body: [{ type: "text", text: "stub" }],
  } as unknown as TopicT;
}

describe("groupTopicsByLevelThenTerm", () => {
  it("returns [] for empty input", () => {
    expect(groupTopicsByLevelThenTerm([])).toEqual([]);
  });

  it("groups levels in S1..S4 order, skipping empty levels", () => {
    const groups = groupTopicsByLevelThenTerm([
      topic("a", "S1", 1),
      topic("b", "S4", 1),
      topic("c", "S2", 1),
    ]);
    expect(groups.map((g) => g.level)).toEqual(["S1", "S2", "S4"]);
  });

  it("groups by term within a level, terms in order, untermed last", () => {
    const [s2] = groupTopicsByLevelThenTerm([
      topic("x", "S2"),
      topic("c", "S2", 3),
      topic("a", "S2", 1),
    ]);
    expect(s2.terms.map((t) => t.label)).toEqual(["Term 1", "Term 3", "Other topics"]);
  });

  it("sorts a term's topics by order, then title", () => {
    const [s1] = groupTopicsByLevelThenTerm([
      topic("late", "S1", 2, 9),
      topic("b", "S1", 2),
      topic("early", "S1", 2, 4),
      topic("a", "S1", 2),
    ]);
    expect(s1.terms[0].topics.map((t) => t.id)).toEqual(["early", "late", "a", "b"]);
  });
});

describe("topicsInTeachingOrder", () => {
  it("runs S1 term 1 to S4, term by term", () => {
    const ids = topicsInTeachingOrder([
      topic("s2t1", "S2", 1, 1),
      topic("s1t3", "S1", 3, 9),
      topic("s1t1", "S1", 1, 1),
    ]).map((t) => t.id);
    expect(ids).toEqual(["s1t1", "s1t3", "s2t1"]);
  });
});

describe("currentTerm", () => {
  it("maps months onto Uganda's three terms", () => {
    expect(currentTerm(new Date(2026, 0, 15))).toBe(1);
    expect(currentTerm(new Date(2026, 3, 30))).toBe(1);
    expect(currentTerm(new Date(2026, 4, 25))).toBe(2);
    expect(currentTerm(new Date(2026, 7, 21))).toBe(2);
    expect(currentTerm(new Date(2026, 9, 18))).toBe(3);
  });
});
