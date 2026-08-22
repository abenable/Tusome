// Pure grouping logic for the topic-list page (and later for the dashboard).
//
// Topics are grouped by level (S1..S4) and, within a level, by strand — the way
// a teacher scanning the NCDC syllabus looks for a topic. Levels always render
// in canonical order. Strands and the topics within them sort by each topic's
// `order` (its position in the syllabus's own term-by-term programme planner)
// so the on-screen sequence matches teaching order, not filesystem directory
// order (which Rust's `fs::read_dir` — and therefore pack load order — never
// guarantees). A strand's position is its lowest topic `order`; strands tie
// (or a topic omits `order` entirely) fall back to alphabetical, so two packs
// authored independently without `order` still produce a stable, if
// syllabus-agnostic, on-screen order.
//
// Kept pure (no React, no IO) so it can be unit-tested with bun:test and
// reused outside the route component.

import type { TopicT } from "@/content/schema";

export type StrandGroup = { strand: string; topics: TopicT[] };
export type LevelGroup = { level: string; strands: StrandGroup[] };

// Canonical lower-secondary level order. Keep this explicit rather than
// sorting the strings lexicographically — "S10" would one day break the latter.
export const LEVEL_ORDER = ["S1", "S2", "S3", "S4"] as const;

/**
 * Group topics by level (S1..S4, in that order, skipping empty levels), then
 * within each level by strand (alphabetical). Returns `[]` for empty input.
 */
export function groupTopicsByLevelThenStrand(topics: TopicT[]): LevelGroup[] {
  if (topics.length === 0) return [];

  const byLevel = new Map<string, TopicT[]>();
  for (const t of topics) {
    const bucket = byLevel.get(t.level);
    if (bucket) bucket.push(t);
    else byLevel.set(t.level, [t]);
  }

  const out: LevelGroup[] = [];
  for (const level of LEVEL_ORDER) {
    const bucket = byLevel.get(level);
    if (!bucket || bucket.length === 0) continue;

    // Group by strand within this level.
    const byStrand = new Map<string, TopicT[]>();
    for (const t of bucket) {
      const s = byStrand.get(t.strand);
      if (s) s.push(t);
      else byStrand.set(t.strand, [t]);
    }

    const strands: StrandGroup[] = [...byStrand.entries()]
      .map(([strand, ts]) => ({
        strand,
        topics: [...ts].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)),
      }))
      .sort((a, b) => {
        const orderOf = (s: StrandGroup) =>
          Math.min(...s.topics.map((t) => t.order ?? Infinity));
        return orderOf(a) - orderOf(b) || a.strand.localeCompare(b.strand);
      });

    out.push({ level, strands });
  }

  return out;
}
