// A group of topics under a strand heading. Rendered by the topic-list page
// once per (level, strand) bucket. The card markup mirrors the pre-W3
// topic-row markup exactly so the visual treatment is unchanged — only the
// grouping is new.
//
// Heading level is configurable (`headingAs`, default "h2") so the
// topic-list page can keep a clean h1 (subject) → h2 (level) → h3 (strand)
// outline while other callers (e.g. a future search results page) can use h2.

import { Link } from "@tanstack/react-router";

import type { TopicT } from "@/content/schema";
import type { Subject } from "@/lib/subjects";

export type TopicGroupProps = {
  heading: string;
  topics: TopicT[];
  subject: Subject;
  headingAs?: "h2" | "h3";
};

export function TopicGroup({
  heading,
  topics,
  subject,
  headingAs = "h2",
}: TopicGroupProps) {
  const Heading = headingAs;
  return (
    <section className="flex flex-col gap-3" aria-label={heading}>
      <Heading className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
        {heading}
      </Heading>
      <ul className="flex flex-col gap-3">
        {topics.map((topic) => (
          <li
            key={topic.id}
            className="flex flex-col gap-3 rounded-[11px] border border-hairline bg-card px-6 py-5"
          >
            <Link
              to="/$subject/$topicId"
              params={{ subject, topicId: topic.id }}
              className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f] hover:text-[#0066cc]"
              style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
            >
              {topic.title}
            </Link>
            <div className="flex gap-6">
              <Link
                to="/$subject/$topicId"
                params={{ subject, topicId: topic.id }}
                className="text-[17px] text-[#0066cc] hover:underline"
                style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
              >
                Open
              </Link>
              <Link
                to="/$subject/$topicId/quiz"
                params={{ subject, topicId: topic.id }}
                className="text-[17px] text-[#0066cc] hover:underline"
                style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
              >
                Take quiz
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
