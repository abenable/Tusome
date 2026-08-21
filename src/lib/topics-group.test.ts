import { describe, it, expect } from "bun:test";

import type { TopicT } from "@/content/schema";
import { groupTopicsByLevelThenStrand } from "@/lib/topics-group";

// Minimal TopicT builder — grouping only reads `id`, `title`, `level`, and
// `strand`, so stub the rest. Casting through `unknown` keeps the test free of
// Zod-shaped boilerplate without weakening the helper's real type signature.
function topic(
  id: string,
  level: TopicT["level"],
  strand: string,
  title = id,
): TopicT {
  return {
    id,
    title,
    subject: "physics",
    level,
    strand,
    subStrand: "stub",
    outcomes: ["stub"],
    body: [{ type: "text", text: "stub" }],
    quiz: [
      {
        id: "q1",
        prompt: "stub",
        kind: "single",
        options: [{ id: "a", text: "a" }],
        correct: ["a"],
        explanation: "stub",
      },
    ],
  } as unknown as TopicT;
}

describe("groupTopicsByLevelThenStrand", () => {
  it("returns [] for empty input", () => {
    expect(groupTopicsByLevelThenStrand([])).toEqual([]);
  });

  it("groups levels in S1..S4 order, skipping empty levels", () => {
    const groups = groupTopicsByLevelThenStrand([
      topic("a", "S1", "Motion"),
      topic("b", "S4", "Waves"),
      topic("c", "S2", "Optics"),
    ]);
    expect(groups.map((g) => g.level)).toEqual(["S1", "S2", "S4"]);
  });

  it("groups by strand within a level, strands sorted alphabetically", () => {
    const groups = groupTopicsByLevelThenStrand([
      topic("a", "S2", "Waves"),
      topic("b", "S2", "Motion"),
      topic("c", "S2", "Motion"),
    ]);
    expect(groups).toHaveLength(1);
    const s2 = groups[0];
    expect(s2.level).toBe("S2");
    expect(s2.strands.map((s) => s.strand)).toEqual(["Motion", "Waves"]);
    expect(s2.strands[0].topics.map((t) => t.id)).toEqual(["b", "c"]);
    expect(s2.strands[1].topics.map((t) => t.id)).toEqual(["a"]);
  });

  it("places a topic under the correct level and strand", () => {
    const groups = groupTopicsByLevelThenStrand([
      topic("p", "S3", "Electricity"),
      topic("q", "S1", "Matter"),
    ]);
    const s3 = groups.find((g) => g.level === "S3")!;
    const elec = s3.strands.find((s) => s.strand === "Electricity")!;
    expect(elec.topics.map((t) => t.id)).toEqual(["p"]);
    const s1 = groups.find((g) => g.level === "S1")!;
    const matter = s1.strands.find((s) => s.strand === "Matter")!;
    expect(matter.topics.map((t) => t.id)).toEqual(["q"]);
  });
});
