#!/usr/bin/env bun
// Check every content pack before it ships: `bun run validate:content`.
//
// The app is lenient at runtime (it skips bad packs and unknown block types so
// a lesson never crashes); this is the strict gate that runs in CI.
//   - every pack parses against the Zod schema
//   - no block types the schema doesn't know (catches typos the app would hide)
//   - topic ids are unique, and every topic has a term
//   - PhET sims are in phet-manifest.json, custom sims are in the registry

import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Glob } from "bun"
import { BLOCK_TYPES, Pack, topicSims } from "../src/content/schema"
import { getSim } from "../src/sims"

// fileURLToPath, not URL.pathname: on Windows the latter is "/D:/...".
const root = fileURLToPath(new URL("../content/", import.meta.url))
const manifest = JSON.parse(await readFile(`${root}sims/phet-manifest.json`, "utf-8"))
const phetFiles = new Set<string>(manifest.sims.map((s: { file: string }) => s.file))

const errors: string[] = []
const seen = new Map<string, string>()
let topics = 0

for await (const rel of new Glob("**/pack.json").scan(root)) {
  const raw = JSON.parse(await readFile(root + rel, "utf-8"))
  for (const t of raw.topics ?? []) {
    for (const b of t.body ?? []) {
      if (!BLOCK_TYPES.has(b?.type)) errors.push(`${rel}: ${t.id}: unknown block type "${b?.type}"`)
    }
  }
  const parsed = Pack.safeParse(raw)
  if (!parsed.success) {
    errors.push(`${rel}: ${parsed.error.message}`)
    continue
  }
  for (const t of parsed.data.topics) {
    topics++
    if (seen.has(t.id)) errors.push(`${rel}: duplicate topic id ${t.id} (also in ${seen.get(t.id)})`)
    seen.set(t.id, rel)
    if (t.term === undefined) errors.push(`${rel}: ${t.id}: no term`)
    const sims = topicSims(t)
    for (const sim of sims) {
      if ("phet" in sim && !phetFiles.has(sim.phet)) {
        errors.push(`${rel}: ${t.id}: PhET sim ${sim.phet} isn't in phet-manifest.json`)
      }
      if ("simId" in sim && !getSim(sim.simId)) {
        errors.push(`${rel}: ${t.id}: no custom sim "${sim.simId}" in src/sims`)
      }
    }
    const files = sims.map((s) => ("phet" in s ? s.phet : s.simId))
    if (new Set(files).size !== files.length) errors.push(`${rel}: ${t.id}: the same sim is listed twice`)
  }
}

if (errors.length) {
  console.error(errors.join("\n"))
  console.error(`\n${errors.length} problem(s)`)
  process.exit(1)
}
console.log(`${topics} topics OK`)
