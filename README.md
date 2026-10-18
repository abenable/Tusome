# Tusome

Offline-first desktop app for Uganda's lower-secondary CBC (S1–S4) science and
maths — Biology, Chemistry, Physics, Mathematics. Built for low-spec shared
school machines with no internet: simulations, lessons, and quizzes run
entirely offline; progress is stored locally per student.

> **Status:** prototype. Content is draft (pending NCDC syllabus sign-off and
> teacher review). Hardware optimisation for the slowest target machines is
> deferred — see *Limitations*.

## What's inside

- **Simulations** are [PhET](https://phet.colorado.edu/) HTML5 sims bundled as
  single self-contained files and loaded in an iframe (CC BY 4.0; a partnership
  license is being arranged — see `scripts/fetch-phet-sims.sh`). One custom
  TypeScript sim (`src/sims/projectile.ts`) demonstrates the in-process
  `SimModule` path.
- **Lessons** are JSON *content packs* (`content/<subject>/<topic>/pack.json`)
  — structured body blocks (text, LaTeX equations, images) authored without
  code changes. Validated with Zod on load.
- **Quizzes** with seeded per-attempt randomisation; scores persist in SQLite.
- **Profiles** for shared machines (students pick a name; Guest mode),
  a student dashboard, a PIN-gated teacher view with CSV export, and a
  PIN-gated admin/settings screen.
- **Updates** via signed USB content bundles (Ed25519/minisign) and an opt-in
  online updater (`tauri-plugin-updater`). Content updates apply without a
  restart; binary updates defer to idle.

## Stack

Tauri 2 · React 19 · TypeScript 7 · Vite 8 · TanStack Router + Query ·
Tailwind v4 · shadcn · SQLite (`tauri-plugin-sql`) · `bun` (package manager +
test runner).

## Requirements

- [Rust](https://rustup.rs/) (stable) and the Tauri 2 prerequisites for your OS
  (on Linux: `libwebkit2gtk` etc.; on Windows: WebView2).
- [bun](https://bun.sh/) ≥ 1.4
- [Node.js](https://nodejs.org/) (bun covers it, but Tauri tooling may call
  `node`)

## Getting started

```sh
bun install                      # deps
bun run fetch:sims               # download + sha256-verify the 8 PhET sims
                                 # into content/sims/ (gitignored artifacts)
bun tauri dev                    # run the desktop app (dev)
```

The PhET sim files are gitignored as vendored third-party artifacts; the fetch
script makes them reproducible and `beforeBuildCommand` runs it automatically
before a release build.

## Building an installer

```sh
bun tauri build                  # builds the app + bundles installers
                                 # (.deb/.AppImage on Linux, .msi/.exe on Windows)
```

The installer is ~16 MB with all 8 sims bundled.

## Project layout

```
src/                  React frontend (routes, components, content loader, sims)
src-tauri/            Rust shell (plugins, commands, migrations, update core)
content/              JSON content packs (one folder per topic) + sims/
content/sims/         PhET HTML5 sims (gitignored) + phet-manifest.json (tracked)
scripts/              fetch-phet-sims.sh, autobuild.sh
```

## Content packs

A pack (`content/<subject>/<topic>/pack.json`) carries topic metadata, learning
outcomes, body blocks, an optional simulation reference, and quiz questions.
Schema lives in `src/content/schema.ts`. A sim reference is one of:

```jsonc
{ "sim": { "simId": "projectile", "params": { "speed": 20 } } }   // custom TS sim
{ "sim": { "phet": "circuit-construction-kit-dc_en.html" } }      // bundled PhET sim
```

## Testing

```sh
bun test            # frontend unit tests (bun:test)
cd src-tauri && cargo test   # Rust unit tests (incl. update signature/copy tests)
```

## Limitations (prototype)

- **Content is draft** — outcomes are placeholders pending the official NCDC
  syllabus and teacher review. Only a handful of topics are populated.
- **Signing key is the dev key** — `~/.tusome/tusome.key`. Generate and rotate
  in a production keypair before any real distribution; keep the private key
  out of the repo and CI.
- **No hardware validation yet** — the app has not been run on the actual
  target school machines (performance, WebView2 availability, projector
  legibility). Optimisation for the slowest hardware is a later phase.
- **PhET license pending** — sims are used under CC BY 4.0 for prototyping; a
  formal partnership license with PhET is being arranged.

## License

Source code: see the repository license. Bundled PhET simulations are
© PhET, CC BY 4.0, used for prototyping while a partnership license is
arranged — do not redistribute the sim files without that license.
