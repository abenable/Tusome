// What read-aloud says, as an ordered list of chunks (about a sentence each).
//
// Pure, so the renderer and the reader agree on chunk keys and it can be
// tested without a speech engine. A chunk key is "<block>-<n>"; the lesson
// renderer marks the span with the same key so the reader can highlight it.
// Block -1 is the lesson header (title and outcomes).

import type { BlockT, TopicT } from "@/content/schema"

export type Chunk = { key: string; text: string }

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("en", { granularity: "sentence" })
    : null

/** Split into sentences. Joining the pieces gives back the exact input. */
export function splitSentences(text: string): string[] {
  if (!segmenter) return text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  return Array.from(segmenter.segment(text), (s) => s.segment)
}

// Symbols a speech engine would read literally ("g slash cm three").
// Bracketed codes go first; then units longest first, so "kg/m³" wins over "m³".
const SAY: Array<[RegExp, string]> = [
  // NCDC outcome codes such as "(u, s, gs)" or "(k)": not for reading out.
  [/\s*\((?:k|u|s|gs|v\/a|v|a)(?:[,\s]\s*(?:k|u|s|gs|v\/a|v|a))*\)/g, ""],
  // An abbreviation in brackets right after its spoken form: "metre (m)".
  [/\s*\((?:g\/cm³|kg\/m³|m\/s²?|km\/h|N|J|W|Pa|kg|g|m|cm|mm|km|s|A|V|Ω)\)/g, ""],
  [/\bkg\/m³/g, "kilograms per cubic metre"],
  [/\bg\/cm³/g, "grams per cubic centimetre"],
  [/\bm\/s²/g, "metres per second squared"],
  [/\bkm\/h\b/g, "kilometres per hour"],
  [/\bm\/s\b/g, "metres per second"],
  [/\bcm³/g, "cubic centimetres"],
  [/\bm³/g, "cubic metres"],
  [/\bcm²/g, "square centimetres"],
  [/\bm²/g, "square metres"],
  [/°C\b/g, " degrees Celsius"],
  [/×/g, " times "],
  [/÷/g, " divided by "],
  [/→/g, " gives "],
  [/≈/g, " is about "],
  [/\bUGX\s?(\d+(?:,\d{3})*)/g, "$1 shillings"],
]

/** Rewrite symbols into words a speech engine says properly. */
export function speakable(text: string): string {
  let out = text
  for (const [re, words] of SAY) out = out.replace(re, words)
  return out.replace(/\s{2,}/g, " ").trim()
}

const CALLOUT_LABEL = { activity: "Try this", think: "Think and discuss", remember: "Remember" }

/** The spoken pieces of one block, in reading order. */
export function blockChunks(block: BlockT, i: number): Chunk[] {
  const pieces = (texts: string[]) =>
    texts
      .map((t, n) => ({ key: `${i}-${n}`, text: speakable(t) }))
      .filter((c) => c.text.length > 0)
  switch (block.type) {
    case "text":
      return pieces(splitSentences(block.text))
    case "heading":
      return pieces([block.text])
    case "list":
      return pieces(block.items)
    case "equation":
      return block.speech ? pieces([block.speech]) : []
    case "example":
      return pieces([`Worked example. ${block.title}`, ...block.steps])
    case "callout":
      return pieces([
        `${CALLOUT_LABEL[block.kind]}.${block.title ? ` ${block.title}.` : ""}`,
        ...splitSentences(block.text),
      ])
    case "image":
      return pieces([`Picture: ${block.alt}`])
  }
}

/** Everything read-aloud says for a lesson: title, outcomes, then the body. */
export function topicChunks(topic: TopicT): Chunk[] {
  const header = [topic.title, "What you'll learn.", ...topic.outcomes]
    .map((t, n) => ({ key: `-1-${n}`, text: speakable(t) }))
  return [...header, ...topic.body.flatMap((b, i) => blockChunks(b, i))]
}
