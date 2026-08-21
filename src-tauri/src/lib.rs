// CBCLab Tauri shell — plugin registration, first-run content seed, and the
// content-read command.
//
// Directory model (see docs/plan/03-architecture.md §"The three directories"):
//   - install dir       — binary + bundled content resources, read-only,
//                         replaced on reinstall
//   - app data dir /cbclab/content/ — writable content packs, seeded from the
//                         bundled resources on first run, survives reinstall,
//                         hot-swapped by the Phase-5 USB update channel
//   - app config dir /cbclab.db     — writable progress DB, survives reinstall
//
// ── Where "sqlite:cbclab.db" actually lands ──────────────────────────────
//
// tauri-plugin-sql resolves the `sqlite:<name>` prefix against the Tauri
// *app config dir* (`app_config_dir()`), NOT the app data dir. On Windows the
// two coincide (`%APPDATA%\ug.cbclab`), so the shipping target is unaffected.
// On Linux they split: the DB lands in `~/.config/ug.cbclab/cbclab.db` while
// content lives under `~/.local/share/ug.cbclab/cbclab/content/`. That is two
// roots, but the three-directory guarantee the architecture doc cares about
// (install / content / data are all distinct and reinstall-safe) still holds.
// We pass only the bare `"sqlite:cbclab.db"` connection string and let the
// plugin own path resolution — never hardcode a filesystem path. The actual
// relaunch-survival guarantee is verified as a human Gate-1 check
// (docs/plan/04-vertical-slice.md §2), not asserted here.
//
// ── Content shipping ─────────────────────────────────────────────────────
//
// `tauri.conf.json` bundles `content/**/*` into the installer's resources.
// On first run the `setup` hook copies that bundled tree into the writable
// app-data content dir (so USB updates in Phase 5 can hot-swap it). The
// `read_content_packs` command then reads packs from the writable dir, with a
// fallback to the bundled resources and (in dev) the repo-root content tree.
// Reading is a Rust command rather than the JS plugin-fs so there is no fs
// capability-scope to configure and the production read path is exercised
// exactly the way a school machine will use it.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

#[derive(Serialize)]
struct ContentPackFile {
    path: String,
    raw: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            Builder::default()
                .add_migrations(
                    "sqlite:cbclab.db",
                    vec![
                        Migration {
                            version: 1,
                            description: "init",
                            sql: include_str!("../migrations/001_init.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "settings_and_seed",
                            sql: include_str!("../migrations/002_settings_and_seed.sql"),
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            read_content_packs,
            get_content_manifest_version
        ])
        .setup(|app| {
            seed_content(&app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ──────────────────────────────────────────────────────────────────────────
// read_content_packs — the production content-read path.
//
// Returns `{ path, raw }[]` for every `pack.json` found. Never errors: a
// missing/unreadable dir just yields an empty vec, and the frontend renders
// "No topics yet" rather than crashing during a lesson.
// ──────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn read_content_packs(app: tauri::AppHandle) -> Vec<ContentPackFile> {
    let paths = app.path();
    let mut found: Vec<(PathBuf, String)> = Vec::new();

    // 1. Writable content dir — seeded on first run, the one Phase-5 USB updates
    //    write into. This is where production reads from after the seed.
    if let Ok(data_dir) = paths.app_data_dir() {
        walk_packs(&data_dir.join("cbclab").join("content"), &mut found);
    }

    // 2. Bundled resources fallback — used before the seed has run (e.g. a dev
    //    session that never seeded) or if the writable copy was wiped. The
    //    bundled copy is read-only, so USB updates still need the writable dir;
    //    this fallback is just so content is never invisible.
    if found.is_empty() {
        if let Ok(res_dir) = paths.resource_dir() {
            walk_packs(&res_dir.join("content"), &mut found);
        }
    }

    // 3. Dev-only repo-root fallback. In `bun tauri dev` the bundle.resources
    //    aren't materialized the way a built installer materializes them, so
    //    both paths above can be empty on a developer's machine. CWD for a dev
    //    launch is the project root, so `./content` is the authored tree. This
    //    is gated on debug so it can never ship.
    #[cfg(debug_assertions)]
    if found.is_empty() {
        if let Ok(cwd) = std::env::current_dir() {
            walk_packs(&cwd.join("content"), &mut found);
        }
    }

    found
        .into_iter()
        .map(|(p, raw)| ContentPackFile {
            path: p.display().to_string(),
            raw,
        })
        .collect()
}

/// Recursively collect every `pack.json` under `dir`, reading its contents.
fn walk_packs(dir: &Path, out: &mut Vec<(PathBuf, String)>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_packs(&path, out);
        } else if path.file_name().is_some_and(|n| n == "pack.json") {
            if let Ok(raw) = fs::read_to_string(&path) {
                out.push((path, raw));
            }
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// get_content_manifest_version — read the content manifest's `version` field.
//
// Reads `<app_data_dir>/cbclab/content/manifest.json` (the same writable
// content dir `read_content_packs` reads from), parses it as JSON, and returns
// the `version` field as a string. On ANY error — file missing, unreadable,
// not valid JSON, or no `version` field — returns `"unknown"`. Never panics:
// a school machine with no manifest (first run, wiped dir) must still show
// "unknown" in the AdminPanel About section, not a crash.
//
// This is the single Rust command the frontend's About panel needs; it's kept
// here rather than the JS plugin-fs so the read path mirrors the production
// content-read path (no fs capability-scope to configure).
// ──────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn get_content_manifest_version(app: tauri::AppHandle) -> String {
    let paths = app.path();
    let manifest = match paths.app_data_dir() {
        Ok(data_dir) => data_dir.join("cbclab").join("content").join("manifest.json"),
        Err(_) => return "unknown".to_string(),
    };

    let raw = match fs::read_to_string(&manifest) {
        Ok(s) => s,
        Err(_) => return "unknown".to_string(),
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return "unknown".to_string(),
    };

    match parsed.get("version") {
        Some(serde_json::Value::String(v)) => v.clone(),
        // A numeric version (e.g. 2) is stringified so the panel shows "2".
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => "unknown".to_string(),
    }
}

// ──────────────────────────────────────────────────────────────────────────
// First-run seed: copy bundled content → writable content dir, but only if the
// writable dir is empty. That preserves any USB-delivered packs already there
// (Phase 5) — we never overwrite a pack the admin dropped on the machine.
// ──────────────────────────────────────────────────────────────────────────
fn seed_content(app: &tauri::AppHandle) {
    let paths = app.path();

    let data_dir = match paths.app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[seed] could not resolve app_data_dir: {e}");
            return;
        }
    };
    let target = data_dir.join("cbclab").join("content");

    // Don't clobber a populated dir — a re-seed on a later launch must not wipe
    // USB-delivered content or updated packs.
    if has_packs(&target) {
        return;
    }

    let source = match paths.resource_dir() {
        Ok(r) => r.join("content"),
        Err(e) => {
            eprintln!("[seed] could not resolve resource_dir: {e}");
            return;
        }
    };
    if !source.exists() {
        // Dev (no materialized resources) — the dev-only repo fallback in the
        // read command handles this; nothing to seed.
        return;
    }
    if let Err(e) = copy_tree(&source, &target) {
        eprintln!(
            "[seed] failed to seed content from {} to {}: {e}",
            source.display(),
            target.display()
        );
    }
}

fn has_packs(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if has_packs(&p) {
                return true;
            }
        } else if p.file_name().is_some_and(|n| n == "pack.json") {
            return true;
        }
    }
    false
}

fn copy_tree(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_tree(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}
