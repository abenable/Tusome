import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import katex from "katex"
import "katex/dist/katex.min.css"

import { SUBJECT_LABELS, isSubject, type Subject } from "@/lib/subjects"
import { type BlockT, type TopicT } from "@/content/schema"
import { SimCanvas } from "@/components/SimCanvas"

// Cross-builder seam (content-author). See sibling $subject/index.tsx for the
// rationale: importing defensively, try/catch at the call site.
import { findTopicInPacks, loadPacksCached } from "@/content/loader"

export const Route = createFileRoute("/$subject/$topicId/")({
  beforeLoad: ({ params }) => {
    if (!isSubject(params.subject)) {
      throw notFound()
    }
  },
  loader: async ({ params, context }): Promise<{ topic: TopicT | null }> => {
    try {
      const { packs } = await loadPacksCached(context.queryClient)
      const topic = findTopicInPacks(packs, params.topicId)
      return { topic }
    } catch {
      return { topic: null }
    }
  },
  component: TopicView,
})

function TopicView() {
  const { subject, topicId } = Route.useParams()
  const { topic } = Route.useLoaderData()

  if (!topic) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink subject={subject} />
        <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          Topic not found
        </h1>
        <p className="font-sans text-[17px] leading-relaxed text-[#666666]">
          This topic isn’t available yet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <BackLink subject={subject} />

      <header className="flex flex-col gap-2">
        <p className="font-sans text-[14px] uppercase tracking-wide text-[#666666]">
          {SUBJECT_LABELS[subject as Subject]} · {topic.level} · {topic.strand}
        </p>
        <h1 className="font-heading text-[34px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">
          {topic.title}
        </h1>
      </header>

      {/* Learning outcomes, verbatim from the NCDC syllabus. */}
      {topic.outcomes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
            Learning outcomes
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-6 font-sans text-[17px] leading-relaxed text-[#1d1d1f]">
            {topic.outcomes.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Body blocks: text and equation render directly; image is a placeholder
          for Phase 1 (resolution relative to the pack isn't wired here yet). */}
      <section className="flex flex-col gap-4">
        {topic.body.map((block: BlockT, i) => {
          if (block.type === "text") {
            return (
              <p
                key={i}
                className="font-sans text-[17px] leading-relaxed text-[#1d1d1f]"
              >
                {block.text}
              </p>
            )
          }
          if (block.type === "equation") {
            // `latex` → typeset with KaTeX; `expr` → plain readable math.
            //
            // KaTeX's output HTML is generated from a trusted pack math string,
            // not arbitrary pack HTML — KaTeX only emits math markup (no
            // script/links), and `throwOnError: false` renders bad TeX in red
            // rather than throwing. This is the standard safe pattern for math
            // typesetting; it is distinct from doc 07's "never
            // dangerouslySetInnerHTML pack HTML" rule, which is about author
            // content, not the math renderer.
            if (block.latex) {
              const html = katex.renderToString(block.latex, {
                displayMode: true,
                throwOnError: false,
                output: "htmlAndMathml",
              })
              return (
                <div
                  key={i}
                  className="mx-auto flex max-w-fit justify-center overflow-x-auto rounded-[8px] bg-[#f5f5f7] px-6 py-4 text-[#1d1d1f]"
                  aria-label="equation"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )
            }
            return (
              <pre
                key={i}
                className="mx-auto max-w-fit overflow-x-auto rounded-[8px] bg-[#f5f5f7] px-6 py-4 font-sans text-[19px] tracking-tight text-[#1d1d1f]"
                aria-label="equation"
              >
                {block.expr ?? ""}
              </pre>
            )
          }
          // image — placeholder for Phase 1
          return (
            <div
              key={i}
              className="rounded-[8px] border border-hairline bg-[#f5f5f7] px-4 py-8 text-center font-sans text-[14px] text-[#666666]"
            >
              [image: {block.alt}]
            </div>
          )
        })}
      </section>

      {/* Simulation host. <SimCanvas> reads the registry by simId and owns
          the rAF loop; content packs name only a simId + params, never a
          component (03-architecture.md §Simulation contract). */}
      {topic.sim ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-[21px] font-semibold tracking-tight text-[#1d1d1f]">
            Simulation
          </h2>
          <SimCanvas
            simId={topic.sim.simId}
            params={(topic.sim.params as Record<string, number>) ?? {}}
          />
          {topic.sim.caption ? (
            <p className="font-sans text-[14px] text-[#666666]">
              {topic.sim.caption}
            </p>
          ) : null}
        </section>
      ) : null}

      <nav className="flex">
        <Link
          to="/$subject/$topicId/quiz"
          params={{ subject, topicId }}
          className="inline-flex min-h-[44px] items-center rounded-[9999px] bg-[#0066cc] px-6 text-[17px] text-white hover:bg-[#0071e3]"
        >
          Take quiz
        </Link>
      </nav>
    </div>
  )
}

function BackLink({ subject }: { subject: string }) {
  return (
    <nav>
      <Link
        to="/$subject"
        params={{ subject }}
        className="text-[17px] text-[#0066cc] hover:underline"
        style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
      >
        Back to {SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS] ?? subject}
      </Link>
    </nav>
  )
}
