// A strand's topics, rendered as the design's "learning path": a rail of
// status circles joined by a vertical line, each beside a topic card.
//
// Ported from TopicList.dc.html (claude.ai/design "UI design improvement
// request"), `layoutStyle: "path"` — the design's own default. The rail is
// decorative and `aria-hidden`; every status it encodes is also written as
// text in the badge beside it, so nothing depends on shape or colour alone.
//
// Heading level stays configurable (`headingAs`, default "h2") so the topic
// list can keep a clean h1 (subject) → h2 (strand) outline.

import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import type { TopicT } from "@/content/schema";
import { SUBJECT_ACCENTS, type Subject } from "@/lib/subjects";

export type TopicStatus = "completed" | "in-progress" | "not-started";

export type TopicProgress = {
  status: TopicStatus;
};

export type TopicGroupProps = {
  heading: string;
  topics: TopicT[];
  subject: Subject;
  /** Per-topic status. A topic missing from the map reads as not-started. */
  progressOf: (topicId: string) => TopicProgress;
  headingAs?: "h2" | "h3";
};

const BADGE_TEXT: Record<TopicStatus, string> = {
  completed: "Completed",
  "in-progress": "In progress",
  "not-started": "Not started",
};

export function TopicGroup({
  heading,
  topics,
  subject,
  progressOf,
  headingAs = "h2",
}: TopicGroupProps) {
  const Heading = headingAs;
  const accent = SUBJECT_ACCENTS[subject];

  return (
    <section className="flex flex-col gap-[14px]" aria-label={heading}>
      <Heading className="font-sans text-[15px] font-bold uppercase tracking-[.06em] text-ink-3">
        {heading}
      </Heading>
      <ul className="flex flex-col gap-3">
        {topics.map((topic, i) => {
          const { status } = progressOf(topic.id);
          const isLast = i === topics.length - 1;
          return (
            <li key={topic.id} className="flex gap-4">
              {/* Rail. Decorative: the badge below carries the same meaning. */}
              <div
                aria-hidden
                className="flex w-7 shrink-0 flex-col items-center"
              >
                {status === "completed" ? (
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-white ${accent.bg}`}
                  >
                    <Check size={15} strokeWidth={3} />
                  </span>
                ) : status === "in-progress" ? (
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border-[2.5px] ${accent.tint} ${accent.border}`}
                  >
                    <span
                      className={`size-[9px] rounded-full ${accent.bg}`}
                    />
                  </span>
                ) : (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface font-sans text-[14px] font-extrabold text-ink-3">
                    {i + 1}
                  </span>
                )}
                {!isLast && (
                  <div className={`-mb-3 mt-1 w-0.5 flex-1 ${accent.bg}`} />
                )}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-4 rounded-[18px] border border-line bg-surface px-[22px] py-[18px] shadow-[0_1px_2px_rgba(0,0,0,.03)]">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/$subject/$topicId"
                    params={{ subject, topicId: topic.id }}
                    className="font-sans text-[20px] font-bold text-ink hover:text-brand"
                  >
                    {topic.title}
                  </Link>
                  <div className="mt-[6px] flex flex-wrap items-center gap-[10px]">
                    <span
                      className={`inline-flex min-h-[26px] items-center rounded-full px-[10px] font-sans text-[14px] font-bold ${
                        status === "completed"
                          ? `${accent.bg} text-white`
                          : status === "in-progress"
                            ? `${accent.tint} ${accent.text}`
                            : "bg-canvas text-ink-3"
                      }`}
                    >
                      {status === "completed" ? "✓ " : ""}
                      {BADGE_TEXT[status]}
                    </span>
                  </div>
                </div>
                <Link
                  to="/$subject/$topicId"
                  params={{ subject, topicId: topic.id }}
                  className={`inline-flex min-h-[44px] shrink-0 items-center font-sans text-[16px] font-bold ${accent.text} hover:underline`}
                  aria-label={`Open ${topic.title}`}
                >
                  Open
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
