#!/usr/bin/env bun
// Write the `latest.json` that installed copies of Tusome poll for updates
// (tauri.conf.json → plugins.updater.endpoints), from a folder of release
// installers and their minisign `.sig` files.
//
//   bun scripts/updater-json.ts <assets-dir> <tag>   e.g. release-assets v1.2.0
//
// The updater looks up "<os>-<arch>-<installer>" first, then "<os>-<arch>",
// so each installer gets its own key and Windows falls back to the .exe.

import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const [dir, tag] = process.argv.slice(2)
if (!dir || !tag) throw new Error("usage: updater-json.ts <assets-dir> <tag>")

const base = `https://github.com/abenable/Tusome/releases/download/${tag}`
const kinds: Array<[RegExp, string[]]> = [
  [/_x64-setup\.exe$/, ["windows-x86_64-nsis", "windows-x86_64"]],
  [/_x64_en-US\.msi$/, ["windows-x86_64-msi"]],
  [/_amd64\.deb$/, ["linux-x86_64-deb", "linux-x86_64"]],
]

const files = await readdir(dir)
const platforms: Record<string, { signature: string; url: string }> = {}
for (const file of files) {
  const kind = kinds.find(([re]) => re.test(file))
  if (!kind || !files.includes(`${file}.sig`)) continue
  const signature = (await readFile(join(dir, `${file}.sig`), "utf-8")).trim()
  for (const key of kind[1]) platforms[key] ??= { signature, url: `${base}/${encodeURIComponent(file)}` }
}
if (Object.keys(platforms).length === 0) throw new Error(`no signed installers in ${dir}`)

const latest = {
  version: tag.replace(/^v/, ""),
  notes: `Tusome ${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
}
await writeFile(join(dir, "latest.json"), JSON.stringify(latest, null, 2) + "\n")
console.log(`latest.json: ${Object.keys(platforms).join(", ")}`)
