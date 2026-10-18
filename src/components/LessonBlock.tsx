// One body block of a lesson. Shared by the lesson page and presenter mode.
//
// Text is rendered sentence by sentence (the same split read-aloud uses), so
// the sentence being read can be highlighted. `active` is the chunk key being
// spoken ("<block>-<n>", see src/lib/speech.ts) or null.

import katex from "katex"
import "katex/dist/katex.min.css"
import { Bookmark, Hand, ImageIcon, MessageCircle } from "lucide-react"
import type { ReactNode } from "react"

import type { BlockT } from "@/content/schema"
import { splitSentences } from "@/lib/speech"
import type { SubjectAccent } from "@/lib/subjects"

const HIGHLIGHT = "rounded-[4px] bg-sun-tint shadow-[0_0_0_3px_var(--color-sun-tint)]"

function Spoken({ k, active, children }: { k: string; active: string | null; children: ReactNode }) {
  return (
    <span data-chunk={k} className={active === k ? HIGHLIGHT : undefined}>
      {children}
    </span>
  )
}

function Sentences({ text, i, from = 0, active }: { text: string; i: number; from?: number; active: string | null }) {
  return splitSentences(text).map((s, n) => (
    <Spoken key={n} k={`${i}-${n + from}`} active={active}>
      {s}
    </Spoken>
  ))
}

const CALLOUTS = {
  activity: { label: "Try this", Icon: Hand, box: "bg-sun-tint", icon: "text-sun-ink" },
  think: { label: "Think and discuss", Icon: MessageCircle, box: "", icon: "" },
  remember: { label: "Remember", Icon: Bookmark, box: "border border-line bg-surface", icon: "text-ink-2" },
} as const

export function LessonBlock({
  block,
  i,
  accent,
  active = null,
}: {
  block: BlockT
  i: number
  accent: SubjectAccent
  active?: string | null
}) {
  switch (block.type) {
    case "text":
      return (
        <p className="font-sans text-[19px] leading-[1.65] text-ink">
          <Sentences text={block.text} i={i} active={active} />
        </p>
      )

    case "heading":
      return (
        <h2 className="mt-3 font-heading text-[27px] font-extrabold leading-[1.2] tracking-[-0.015em] text-ink">
          <Spoken k={`${i}-0`} active={active}>
            {block.text}
          </Spoken>
        </h2>
      )

    case "list": {
      const List = block.ordered ? "ol" : "ul"
      return (
        <List
          className={`flex flex-col gap-2 pl-7 font-sans text-[19px] leading-[1.55] text-ink ${
            block.ordered ? "list-decimal" : "list-disc"
          } marker:text-ink-3`}
        >
          {block.items.map((item, n) => (
            <li key={n} className="pl-1">
              <Spoken k={`${i}-${n}`} active={active}>
                {item}
              </Spoken>
            </li>
          ))}
        </List>
      )
    }

    case "equation": {
      const spoken = block.speech ? `${i}-0` : null
      const box = `max-w-full overflow-x-auto rounded-tile border bg-surface px-6 text-ink ${
        spoken && active === spoken ? "border-sun ring-4 ring-sun-tint" : "border-line"
      }`
      // KaTeX output is generated from a pack math string, not pack HTML:
      // KaTeX only emits math markup (no script/links), and
      // `throwOnError: false` renders bad TeX in red instead of throwing.
      // The MathML half is what screen readers read.
      if (block.latex) {
        const html = katex.renderToString(block.latex, {
          displayMode: true,
          throwOnError: false,
          output: "htmlAndMathml",
        })
        return (
          <div
            role="figure"
            aria-label={block.speech}
            data-chunk={spoken ?? undefined}
            className={`${box} py-2 text-[1.1em]`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      }
      return (
        <pre data-chunk={spoken ?? undefined} className={`${box} py-4 font-sans text-[20px] whitespace-pre-wrap`}>
          {block.expr ?? ""}
        </pre>
      )
    }

    case "example":
      return (
        <section className="rounded-card border border-line bg-surface px-6 py-5">
          <h3 className="mb-3 font-heading text-[20px] font-bold text-ink">
            <Spoken k={`${i}-0`} active={active}>
              <span className={`mr-2 font-sans text-[15px] font-bold uppercase tracking-[0.06em] ${accent.text}`}>
                Worked example
              </span>
              {block.title}
            </Spoken>
          </h3>
          <ol className="flex flex-col gap-2">
            {block.steps.map((step, n) => (
              <li key={n} className="flex gap-3 font-sans text-[18px] leading-[1.55] text-ink">
                <span
                  aria-hidden
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-sans text-[14px] font-bold ${accent.tint} ${accent.text}`}
                >
                  {n + 1}
                </span>
                <Spoken k={`${i}-${n + 1}`} active={active}>
                  {step}
                </Spoken>
              </li>
            ))}
          </ol>
        </section>
      )

    case "callout": {
      const c = CALLOUTS[block.kind]
      return (
        <aside className={`rounded-card px-6 py-5 ${c.box || accent.tint}`}>
          <p className="mb-2 flex items-center gap-2 font-sans text-[16px] font-bold text-ink">
            <c.Icon size={18} aria-hidden className={c.icon || accent.text} />
            <Spoken k={`${i}-0`} active={active}>
              {c.label}
              {block.title ? `: ${block.title}` : ""}
            </Spoken>
          </p>
          <p className="font-sans text-[18px] leading-[1.6] text-ink">
            <Sentences text={block.text} i={i} from={1} active={active} />
          </p>
        </aside>
      )
    }

    case "image":
      // Placeholder until pack-relative image paths are wired up.
      return (
        <figure className="flex flex-col items-center gap-2 rounded-tile border border-dashed border-line bg-surface px-4 py-10 text-center">
          <ImageIcon size={28} aria-hidden className="text-ink-3" />
          <figcaption className="font-sans text-[16px] text-ink-3">{block.alt}</figcaption>
        </figure>
      )
  }
}
