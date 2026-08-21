import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { SUBJECT_LABELS, isSubject, type Subject } from "@/lib/subjects"
import { type TopicT } from "@/content/schema"

// The content loader is authored in parallel (content-author). It exports
// `loadTopicsForSubject(subject): TopicT[]`, returning `[]` when the subject has
// no authored packs (chemistry/biology/mathematics during the pilot) or when
// the content directory is unreadable — it skips malformed packs rather than
// throwing (see docs/plan/04-vertical-slice.md step 3). This import is the one
// cross-builder seam in this work unit: until the loader lands, `tsc` will
// flag it, and a defensive try/catch below keeps runtime safe regardless.
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
        <p className="font-sans text-[17px] leading-relaxed text-[#333333]">
          {topics.length > 0
            ? `${topics.length} topic${topics.length === 1 ? "" : "s"} available.`
            : "No topics yet."}
        </p>
      </header>

      {topics.length === 0 ? (
        <p className="font-sans text-[17px] leading-relaxed text-[#7a7a7a]">
          No topics yet.
        </p>
      ) : (
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
      )}
    </div>
  )
}
