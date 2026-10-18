#!/usr/bin/env bun
// Download the PhET HTML5 sim artifacts into content/sims/, verifying each
// against the sha256 in phet-manifest.json. The .html files are gitignored
// (vendored third-party artifacts); this script makes them reproducible.
//
// Run before `bun tauri build` (beforeBuildCommand does this automatically) so
// the sims ship in the installer, and before `bun tauri dev` (the first-run
// seed copies them into the app-data content dir for the asset protocol).
//
// Implemented in bun (not bash) so it works identically on Linux and Windows
// CI — no dependency on `sha256sum`/`curl`/coreutils, which differ or are
// absent in the shell `bun` spawns on Windows.
//
// License: CC BY 4.0 (PhET). Partnership license pending (docs/plan/07, P3).
// Prototype use only — do not redistribute without a signed license.

import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir, access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

type SimEntry = {
  id: string
  file: string
  // Exact PhET release, substituted into `source`. Pinned because PhET's
  // `/latest/` URLs change whenever a sim is republished, which broke the
  // pinned checksums and failed the 1.0.0, 1.0.1 and 1.1.0 release builds.
  // A versioned URL serves the same bytes forever. To upgrade a sim, bump
  // its version here and re-pin its sha256.
  version: string
  // Usually one hash. An array pins every byte stream actually seen, for a
  // URL the CDN serves inconsistently, so the build doesn't flap.
  sha256: string | string[]
}
type Manifest = { source: string; sims: SimEntry[] }

const here = dirname(fileURLToPath(import.meta.url))
const simsDir = join(here, "..", "content", "sims")
const manifestPath = join(simsDir, "phet-manifest.json")

const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

let ok = 0
let bad = 0

for (const sim of manifest.sims) {
  const url = manifest.source
    .replace(/\{id\}/g, sim.id)
    .replace(/\{version\}/g, sim.version)
  const out = join(simsDir, sim.file)
  const expected = Array.isArray(sim.sha256) ? sim.sha256 : [sim.sha256]

  // Skip if already present and matches.
  if (await exists(out)) {
    const got = sha256(await readFile(out))
    if (expected.includes(got)) {
      console.log(`  ${sim.id.padEnd(32)} present (sha256 ok)`)
      ok++
      continue
    }
  }

  process.stdout.write(`  ${sim.id.padEnd(32)} downloading…`)
  try {
    const res = await fetch(url, { redirect: "follow" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const got = sha256(bytes)
    if (!expected.includes(got)) {
      throw new Error(
        `sha256 mismatch (got ${got}, expected one of [${expected.join(", ")}])`,
      )
    }
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, bytes)
    console.log(" ok")
    ok++
  } catch (e) {
    console.log(` FAILED (${e instanceof Error ? e.message : String(e)})`)
    bad++
  }
}

console.log(`done: ${ok} ok, ${bad} failed`)
if (bad > 0) process.exit(1)
