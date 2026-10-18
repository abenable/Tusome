import { describe, expect, it } from "bun:test"

import { blockChunks, speakable, splitSentences, topicChunks } from "./speech"
import type { TopicT } from "@/content/schema"

describe("splitSentences", () => {
  it("splits sentences and keeps the text intact", () => {
    const text = "Density is mass per volume. It tells you how packed matter is. Wood floats."
    const parts = splitSentences(text)
    expect(parts).toHaveLength(3)
    expect(parts.join("")).toBe(text)
  })
})

describe("speakable", () => {
  it("says units and symbols in words", () => {
    expect(speakable("measured in grams per cubic centimetre (g/cm³) in the lab")).toBe(
      "measured in grams per cubic centimetre in the lab",
    )
    expect(speakable("water has a density of 1000 kg/m³")).toBe(
      "water has a density of 1000 kilograms per cubic metre",
    )
    expect(speakable("it heats to 100°C")).toBe("it heats to 100 degrees Celsius")
    expect(speakable("6 × 4 ÷ 2")).toBe("6 times 4 divided by 2")
    expect(speakable("a matooke bunch costs UGX 25,000")).toBe(
      "a matooke bunch costs 25,000 shillings",
    )
    expect(speakable("It costs UGX 5,000, so...")).toBe("It costs 5,000 shillings, so...")
  })

  it("drops NCDC outcome codes", () => {
    expect(speakable("determine densities of substances (u, s, gs)")).toBe(
      "determine densities of substances",
    )
    expect(speakable("manipulate numbers in different bases (u s)")).toBe(
      "manipulate numbers in different bases",
    )
    expect(speakable("identify numbers in any base using abacus. (k)")).toBe(
      "identify numbers in any base using abacus.",
    )
  })
})

describe("blockChunks", () => {
  it("speaks an equation only when it has speech", () => {
    expect(blockChunks({ type: "equation", latex: "\\rho = \\frac{m}{V}" }, 2)).toEqual([])
    expect(
      blockChunks({ type: "equation", latex: "F = ma", speech: "F equals m a" }, 2),
    ).toEqual([{ key: "2-0", text: "F equals m a" }])
  })

  it("labels callouts and keys each piece by block", () => {
    const chunks = blockChunks({ type: "callout", kind: "think", text: "Why? Discuss." }, 5)
    expect(chunks.map((c) => c.key)).toEqual(["5-0", "5-1", "5-2"])
    expect(chunks[0].text).toBe("Think and discuss.")
  })
})

describe("topicChunks", () => {
  it("reads the title and outcomes before the body", () => {
    const topic = {
      title: "Density",
      outcomes: ["understand density (u)"],
      body: [{ type: "text", text: "One. Two." }],
    } as unknown as TopicT
    expect(topicChunks(topic).map((c) => c.text)).toEqual([
      "Density",
      "What you'll learn.",
      "understand density",
      "One.",
      "Two.",
    ])
  })
})
