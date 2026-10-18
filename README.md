<!-- Badges are static because the repo is private and shields.io can't read
     it. Bump the release badge with each release, or switch to dynamic
     badges (img.shields.io/github/v/release/abenable/Tusome) once public. -->

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.svg">
  <img alt="Tusome: offline science and maths for Uganda's S1 to S4 classrooms" src=".github/assets/banner-light.svg" width="100%">
</picture>

<br>
<br>

**An offline desktop app for lower-secondary science and maths in Uganda.**<br>
Lessons, PhET simulations and progress tracking that run on shared school computers with no internet.

<br>

[![Build](https://github.com/abenable/Tusome/actions/workflows/build.yml/badge.svg)](https://github.com/abenable/Tusome/actions/workflows/build.yml)
[![Release](https://img.shields.io/badge/release-v1.1.1-fbc629?style=flat-square&labelColor=201c17)](https://github.com/abenable/Tusome/releases/latest)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-fbc629?style=flat-square&labelColor=201c17)](https://github.com/abenable/Tusome/releases/latest)
![Works offline](https://img.shields.io/badge/works-offline-fbc629?style=flat-square&labelColor=201c17)
![Curriculum](https://img.shields.io/badge/curriculum-Uganda%20CBC%20S1--S4-fbc629?style=flat-square&labelColor=201c17)
![Topics](https://img.shields.io/badge/topics-75-fbc629?style=flat-square&labelColor=201c17)
![Simulations](https://img.shields.io/badge/PhET%20simulations-43-fbc629?style=flat-square&labelColor=201c17)

[![Tauri](https://img.shields.io/badge/Tauri-2-3c3730?style=flat-square&labelColor=201c17&logo=tauri&logoColor=24C8D8)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-3c3730?style=flat-square&labelColor=201c17&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3c3730?style=flat-square&labelColor=201c17&logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-stable-3c3730?style=flat-square&labelColor=201c17&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-3c3730?style=flat-square&labelColor=201c17&logo=tailwindcss&logoColor=06B6D4)](https://tailwindcss.com)
[![SQLite](https://img.shields.io/badge/SQLite-local-3c3730?style=flat-square&labelColor=201c17&logo=sqlite&logoColor=7FB3D5)](https://sqlite.org)
[![Bun](https://img.shields.io/badge/Bun-1.4+-3c3730?style=flat-square&labelColor=201c17&logo=bun&logoColor=FBF0DF)](https://bun.sh)

<br>

[**Download**](https://github.com/abenable/Tusome/releases/latest) ·
[Features](#features) ·
[Screenshots](#screenshots) ·
[Quick start](#quick-start) ·
[Content packs](#content-packs) ·
[Updates and signing](#updates-and-signing)

<br>

<img alt="Tusome home screen: a welcome, a continue card for the last topic, and a featured simulation" src=".github/assets/screenshot-home.webp" width="100%">

</div>

<br>

## Why Tusome

Most school computers in Uganda are shared, old and offline. Tusome is built
for exactly that room: it installs once, runs without a network, keeps each
student's progress on the machine, and is designed to be read off a projector
at the back of a classroom. *Tusome* is Swahili for "let's read".

> [!NOTE]
> **Status: prototype.** Lesson content is draft, pending NCDC syllabus
> sign-off and teacher review. See [Status and limitations](#status-and-limitations).

## Features

<table>
<tr>
<td width="50%" valign="top">

### Offline by design
Everything ships in the installer: lessons, simulations and fonts. No
account, no network, no remote calls from the interface.

</td>
<td width="50%" valign="top">

### 43 PhET simulations
Interactive HTML5 sims from [PhET](https://phet.colorado.edu/), bundled and
pinned to exact versions, plus a native TypeScript sim engine for custom ones.

</td>
</tr>
<tr>
<td valign="top">

### Lessons as content packs
Topics are JSON packs with outcomes, text, LaTeX equations and images,
validated on load. New content needs no code change.

</td>
<td valign="top">

### Made for shared machines
Students pick their class and profile, with a password each. Guest mode lets
anyone practise without saving.

</td>
</tr>
<tr>
<td valign="top">

### Progress that means something
Opening a topic records it; students mark it complete and move on to the
next one. A dashboard shows where they stand in each subject.

</td>
<td valign="top">

### A teacher area
PIN-protected overview, student register with password resets, per-subject
breakdowns and signed content updates over USB.

</td>
</tr>
</table>

## Screenshots

<table>
<tr>
<td width="50%"><img alt="A lesson: learning outcomes, text and a typeset equation" src=".github/assets/screenshot-lesson.webp"></td>
<td width="50%"><img alt="The physics learning path, with completed and in-progress topics" src=".github/assets/screenshot-path.webp"></td>
</tr>
<tr>
<td align="center"><sub><b>Lessons</b> with outcomes, equations and a simulation</sub></td>
<td align="center"><sub><b>Learning paths</b> that fill in as students finish topics</sub></td>
</tr>
<tr>
<td width="50%"><img alt="A student's progress dashboard" src=".github/assets/screenshot-dashboard.webp"></td>
<td width="50%"><img alt="The teacher overview with recent activity" src=".github/assets/screenshot-teacher.webp"></td>
</tr>
<tr>
<td align="center"><sub><b>Student dashboard</b> with progress by subject</sub></td>
<td align="center"><sub><b>Teacher area</b> with class activity at a glance</sub></td>
</tr>
</table>

## Download

Grab the installer for your system from the
[latest release](https://github.com/abenable/Tusome/releases/latest).

| System | File |
| --- | --- |
| Windows 10 and 11 | `Tusome_<version>_x64-setup.exe` (or the `.msi`) |
| Ubuntu, Debian and derivatives | `Tusome_<version>_amd64.deb` |

The installers aren't code-signed yet, so Windows SmartScreen may warn on
first run. Choose **More info**, then **Run anyway**.

## Quick start

You need [Rust](https://rustup.rs/) (stable), [Bun](https://bun.sh/) 1.4 or
newer, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
for your system (WebView2 on Windows, `libwebkit2gtk` on Linux).

```sh
bun install          # dependencies
bun run fetch:sims   # download and checksum-verify the 43 PhET sims
bun tauri dev        # run the desktop app
```

The sim files are third-party artifacts, so they're gitignored. The fetch
script makes them reproducible, and release builds run it automatically.

```sh
bun tauri build      # installers: .deb on Linux, .exe and .msi on Windows
bun test             # frontend tests
cd src-tauri && cargo test   # Rust tests, including update signing
```

<details>
<summary><b>Project layout</b></summary>

```
src/                     React frontend: routes, components, content loader, sims
src-tauri/               Rust shell: plugins, commands, migrations, update core
src-tauri/examples/      make_bundle.rs, the content-bundle signing tool
content/<subject>/       JSON content packs, one folder per topic
content/sims/            PhET sims (gitignored) and phet-manifest.json (tracked)
scripts/                 fetch-phet-sims.ts, autobuild.sh
.github/                 CI release workflow and README assets
```

</details>

<details>
<summary><b>Stack</b></summary>

Tauri 2, React 19, TypeScript 7, Vite 8, TanStack Router and Query,
Tailwind CSS 4, shadcn/Base UI, SQLite through `tauri-plugin-sql`, and Bun
as package manager and test runner. Type is set in Bricolage Grotesque and
Atkinson Hyperlegible Next, both self-hosted.

</details>

## Content packs

A pack lives at `content/<subject>/<topic>/pack.json` and carries topic
metadata, learning outcomes, body blocks and an optional simulation. The
schema is in [`src/content/schema.ts`](src/content/schema.ts). A simulation
reference is one of:

```jsonc
{ "sim": { "simId": "projectile", "params": { "speed": 20 } } }   // custom TypeScript sim
{ "sim": { "phet": "circuit-construction-kit-dc_en.html" } }      // bundled PhET sim
```

PhET sims are pinned to exact versions in
[`content/sims/phet-manifest.json`](content/sims/phet-manifest.json). To
upgrade one, bump its `version` and re-pin its `sha256`.

## Updates and signing

Content updates arrive on a USB stick or, optionally, online. App updates
download in the background and only install when a teacher presses
**Restart and install** in Settings, so nothing interrupts a lesson.

<details>
<summary><b>How signing works</b></summary>

One minisign keypair signs both app updates and content bundles. Every
installed copy trusts only its public key (`CONTENT_PUBKEY` in
`src-tauri/src/updates.rs` and `plugins.updater.pubkey` in
`src-tauri/tauri.conf.json`, key id `CE13264ADFC1E91D`).

- **Private key:** `~/.tusome/tusome.key`. Keep the password in a password
  manager and an offline backup of the key. If the key is lost, no installed
  school machine can ever take another update.
- **Rotating the key** means shipping one release, signed with the old key,
  that carries the new public key.

</details>

<details>
<summary><b>Building a content bundle</b></summary>

```sh
export TAURI_SIGNING_PRIVATE_KEY=~/.tusome/tusome.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...   # from your password manager
bun run bundle:content
```

This writes `dist-bundle/tusome-updates/` (copy it to the root of a USB
stick) and `dist-bundle/bundle.zip` (attach it to a GitHub release for the
online channel). The tool refuses to finish unless the bundle verifies
against the app's public key and installs cleanly into an empty folder.

</details>

## Status and limitations

- **Content is draft.** Outcomes are placeholders pending the official NCDC
  syllabus and teacher review.
- **Online updates need a public release host.** The app sends no
  credentials, so it can't download `latest.json` or `bundle.zip` from this
  private repo. Make it public, or publish releases to a separate public repo
  and update `CONTENT_BUNDLE_URL` in `updates.rs` and `endpoints` in
  `tauri.conf.json`. USB updates work either way.
- **CI builds are unsigned.** No signing secret is set, so CI installers
  carry no updater signature. Sign releases locally, or add
  `TAURI_SIGNING_PRIVATE_KEY` and its password as repo secrets.
- **Not yet tested on target hardware.** Performance, WebView2 availability
  and projector legibility still need checking on real school machines.
- **PhET licence pending.** Sims are used under CC BY 4.0 for prototyping
  while a partnership licence is arranged.

## Credits and licence

- **Simulations:** [PhET Interactive Simulations](https://phet.colorado.edu/),
  University of Colorado Boulder, CC BY 4.0. Don't redistribute the sim files
  without the partnership licence.
- **Fonts:** [Bricolage Grotesque](https://github.com/ateliertriay/bricolage)
  and [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next),
  SIL Open Font License.
- **Icons:** [Lucide](https://lucide.dev), ISC. **Illustrations:**
  [unDraw](https://undraw.co).
- **Source code:** not licensed yet (there's no `LICENSE` file), so default
  copyright applies.

<br>

<div align="center">
<sub>Made for Ugandan classrooms. <a href="#readme">Back to top</a></sub>
</div>
