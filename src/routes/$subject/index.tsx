import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { SUBJECT_LABELS, isSubject, type Subject } from "@/lib/subjects"
import { type TopicT } from "@/content/schema"
import { groupTopicsByLevelThenStrand } from "@/lib/topics-group"
import { EmptyState } from "@/components/EmptyState"
import { TopicGroup } from "@/components/TopicGroup"

// The content loader is authored in parallel (content-author). It reads packs
// from disk (cached in TanStack Query) and returns the topics for a subject,
// or `[]` when none are authored (chemistry/biology/mathematics during the
// pilot) or the content directory is unreadable. See
// docs/plan/04-vertical-slice.md step 3 and 06-app-features.md §"Topic list".
import { loadPacksCached, topicsForSubject } from "@/content/loader"

export const Route = createFileRoute("/$subject/")({
  // Validate the `$subject` param once, before the component renders. An
  // unknown value (e.g. /foobar) renders the not-found state rather than
  // throwing into the route component.
  beforeLoad: ({ params }) => {
    if (!isSubject(params.subject)) {
      throw notFound()
    }
  },
  loader: async ({ params, context }): Promise<{ topics: TopicT[] }> => {
    // Read packs from the TanStack Query cache (one filesystem walk, shared by
    // every subject/topic/quiz route) instead of re-walking on each navigation.
    // `beforeLoad` validated the subject; a defensive try/catch keeps the route
    // safe if the loader itself ever errors.
    try {
      const { packs } = await loadPacksCached(context.queryClient)
      const topics = topicsForSubject(packs, params.subject as TopicT["subject"])
      return { topics: topics ?? [] }
    } catch {
      return { topics: [] }
    }
  },
  component: TopicList,
})

function TopicList() {
  const { subject } = Route.useParams()
  const { topics } = Route.useLoaderData()
  // `beforeLoad` validated the subject; the param is typed as a string by the
  // generated route tree, so narrow it for the labels lookup.
  const subjectKey = subject as Subject
  const label = SUBJECT_LABELS[subjectKey]

  // Group topics by level (S1..S4) then by strand — the way a teacher scans
  // the NCDC syllabus. Empty input yields `[]`, handled by EmptyState below.
  const levels = groupTopicsByLevelThenStrand(topics)

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
          {label}
        </h1>
        {topics.length > 0 ? (
          <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
            {topics.length} topic{topics.length === 1 ? "" : "s"} available.
          </p>
        ) : null}
      </header>

      {topics.length === 0 ? (
        <EmptyState
          title={`No ${label} topics installed yet`}
          message={`Content packs for ${label} aren't installed. Ask your teacher or admin to add them.`}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {levels.map(({ level, strands }) => (
            <section key={level} className="flex flex-col gap-5" aria-label={level}>
              <h2 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
                {level}
              </h2>
              {strands.map(({ strand, topics: strandTopics }) => (
                <TopicGroup
                  key={strand}
                  heading={strand}
                  topics={strandTopics}
                  subject={subjectKey}
                  headingAs="h3"
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
