// Pure grouping logic for the topic-list page.
//
// Topics are grouped by level (S1..S4), then by term (1..3) — the way the
// NCDC programme planner lays out the school year, and the way a teacher
// thinks about "what we're doing this term". Within a term, topics sort by
// `order` (their position in the planner), falling back to title so packs
// authored without `order` still render in a stable order. Topics with no
// `term` go last under "Other topics".
//
// Kept pure (no React, no IO) so it can be unit-tested with bun:test.

import type { TopicT } from "@/content/schema";

export type TermGroup = { term: 1 | 2 | 3 | null; label: string; topics: TopicT[] };
export type LevelGroup = { level: string; terms: TermGroup[] };

// Canonical lower-secondary level order. Keep this explicit rather than
// sorting the strings lexicographically — "S10" would one day break the latter.
export const LEVEL_ORDER = ["S1", "S2", "S3", "S4"] as const;

const TERM_ORDER = [1, 2, 3, null] as const;

/** Group topics by level (S1..S4, skipping empty ones), then by term. */
export function groupTopicsByLevelThenTerm(topics: TopicT[]): LevelGroup[] {
  const out: LevelGroup[] = [];
  for (const level of LEVEL_ORDER) {
    const inLevel = topics.filter((t) => t.level === level);
    if (inLevel.length === 0) continue;
    const terms: TermGroup[] = [];
    for (const term of TERM_ORDER) {
      const ts = inLevel
        .filter((t) => (t.term ?? null) === term)
        .sort(
          (a, b) =>
            (a.order ?? Infinity) - (b.order ?? Infinity) ||
            a.title.localeCompare(b.title),
        );
      if (ts.length > 0) {
        terms.push({ term, label: term ? `Term ${term}` : "Other topics", topics: ts });
      }
    }
    out.push({ level, terms });
  }
  return out;
}

/** Every topic in teaching order: S1 term 1 first, S4's last topic last. */
export function topicsInTeachingOrder(topics: TopicT[]): TopicT[] {
  return groupTopicsByLevelThenTerm(topics).flatMap((l) =>
    l.terms.flatMap((t) => t.topics),
  );
}

/**
 * Which term a date falls in, roughly: Uganda's terms run Feb-Apr/May,
 * late May-Aug and Sep-early Dec. January and the gaps between terms count
 * as the term about to start.
 */
// ponytail: month-based; exact dates move every year (they'd ship as content if this ever needs to be exact).
export function currentTerm(d: Date): 1 | 2 | 3 {
  const m = d.getMonth(); // 0 = January
  return m <= 3 ? 1 : m <= 7 ? 2 : 3;
}
