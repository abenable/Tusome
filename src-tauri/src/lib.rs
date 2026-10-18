// Tusome Tauri shell — plugin registration, first-run content seed, and the
// content-read command.
//
// Directory model (see docs/plan/03-architecture.md §"The three directories"):
//   - install dir       — binary + bundled content resources, read-only,
//                         replaced on reinstall
//   - app data dir /tusome/content/ — writable content packs, seeded from the
//                         bundled resources on first run, survives reinstall,
//                         hot-swapped by the Phase-5 USB update channel
//   - app config dir /tusome.db     — writable progress DB, survives reinstall
//
// ── Where "sqlite:tusome.db" actually lands ──────────────────────────────
//
// tauri-plugin-sql resolves the `sqlite:<name>` prefix against the Tauri
// *app config dir* (`app_config_dir()`), NOT the app data dir. On Windows the
// two coincide (`%APPDATA%\ug.tusome`), so the shipping target is unaffected.
// On Linux they split: the DB lands in `~/.config/ug.tusome/tusome.db` while
// content lives under `~/.local/share/ug.tusome/tusome/content/`. That is two
// roots, but the three-directory guarantee the architecture doc cares about
// (install / content / data are all distinct and reinstall-safe) still holds.
// We pass only the bare `"sqlite:tusome.db"` connection string and let the
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

pub mod lab;
pub mod updates;

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
                    "sqlite:tusome.db",
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
                        Migration {
                            version: 3,
                            description: "update_log",
                            sql: include_str!("../migrations/003_update_log.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 4,
                            description: "student_passwords",
                            sql: include_str!("../migrations/004_student_passwords.sql"),
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .manage(updates::StagedAppUpdate::default())
        .manage(lab::LabState::default())
        .invoke_handler(tauri::generate_handler![
            read_content_packs,
            get_content_manifest_version,
            resolve_content_path,
            updates::scan_and_apply_usb_updates,
            updates::download_and_apply_online_content,
            updates::check_and_stage_app_update,
            updates::staged_app_update_version,
            updates::install_staged_app_update,
            updates::append_update_log,
            updates::get_update_log,
            speech_available,
            speak,
            stop_speaking,
            lab::lab_config,
            lab::save_lab_config,
            lab::lab_query,
            lab::lab_test,
            lab::lab_find_servers,
            lab::lab_this_pc,
            backup_records,
            restore_records
        ])
        .setup(|app| {
            finish_restore(app.handle());
            seed_content(app.handle());
            lab::start_if_server(app.handle());
            // Silent startup USB scan (docs/plan/07): never blocks launch, never
            // shows the student anything. Spawned on the async runtime so it can
            // wait for the webview to open the sql pool without holding up setup.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let r = updates::run_usb_scan(&handle).await;
                updates::persist_log_events_when_ready(&handle, &r.events).await;
            });
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                updates::background_app_update(&handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ──────────────────────────────────────────────────────────────────────────
// Read-aloud on Linux. Ubuntu builds WebKitGTK without Web Speech, so the
// frontend falls back to these: speech-dispatcher's `spd-say`, which Ubuntu
// desktops ship. Windows never needs them (WebView2 has Web Speech).
// `speak` returns when the text has been spoken, so the frontend can move its
// highlight to the next sentence.
// ──────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn speech_available() -> bool {
    cfg!(target_os = "linux")
        && std::process::Command::new("spd-say")
            .arg("--version")
            .output()
            .is_ok_and(|o| o.status.success())
}

#[tauri::command]
async fn speak(text: String, rate: f64) -> Result<(), String> {
    // spd-say's rate runs -100..100, 0 being normal; ours is 1.0 = normal.
    let rate = (((rate - 1.0) * 100.0).round() as i32).clamp(-100, 100);
    tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new("spd-say")
            .args([
                "--wait",
                "--language",
                "en",
                "--rate",
                &rate.to_string(),
                "--",
            ])
            .arg(&text)
            .status()
    })
    .await
    .map_err(|e| e.to_string())?
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_speaking() {
    let _ = std::process::Command::new("spd-say")
        .arg("--cancel")
        .status();
}

// ──────────────────────────────────────────────────────────────────────────
// Student records backup. `backup_records` writes a consistent copy of the
// live database (VACUUM INTO) wherever the teacher chose, e.g. a USB stick.
// `restore_records` can't swap the database while it's open, so it stages
// the file and the next launch swaps it in before anything opens it.
// ──────────────────────────────────────────────────────────────────────────
const RESTORE_FILE: &str = "tusome.db.restore";

#[tauri::command]
async fn backup_records(app: tauri::AppHandle, dest: String) -> Result<(), String> {
    let pool = updates::get_pool(&app)
        .await
        .ok_or("The records aren't open.")?;
    let _ = fs::remove_file(&dest); // VACUUM INTO refuses to overwrite
    sqlx::query("VACUUM INTO ?")
        .bind(&dest)
        .execute(&pool)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_records(app: tauri::AppHandle, src: String) -> Result<(), String> {
    let bytes = fs::read(&src).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"SQLite format 3\0") {
        return Err("That file isn't a Tusome backup.".into());
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::write(dir.join(RESTORE_FILE), bytes).map_err(|e| e.to_string())
}

fn finish_restore(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else {
        return;
    };
    let staged = dir.join(RESTORE_FILE);
    if !staged.exists() {
        return;
    }
    for stale in ["tusome.db-wal", "tusome.db-shm"] {
        let _ = fs::remove_file(dir.join(stale));
    }
    if let Err(e) = fs::rename(&staged, dir.join("tusome.db")) {
        eprintln!("[restore] couldn't swap in the backup: {e}");
    }
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
        walk_packs(&data_dir.join("tusome").join("content"), &mut found);
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
    //    both paths above can be empty on a developer's machine. `cargo run`
    //    (which `tauri dev` invokes) sets the process CWD to the crate root
    //    (src-tauri/), not the repo root, so `current_dir()` is the wrong
    //    anchor here — it resolves to `src-tauri/content`, which never exists.
    //    `CARGO_MANIFEST_DIR` is a compile-time constant Cargo always sets to
    //    the crate root, so `.. ` from it reliably reaches the repo root
    //    regardless of the runtime CWD. This is gated on debug so it can never
    //    ship.
    #[cfg(debug_assertions)]
    if found.is_empty() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        walk_packs(&repo_root.join("content"), &mut found);
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
// get_content_manifest_version — read the content manifest's version field.
//
// Reads `<app_data_dir>/tusome/content/manifest.json` (the same writable
// content dir `read_content_packs` reads from), parses it as JSON, and returns
// the `bundleVersion` field as a string (Phase 7 manifest shape, camelCase),
// falling back to a legacy `version` field, else `"unknown"`. On ANY error —
// file missing, unreadable, not valid JSON — returns `"unknown"`. Never
// panics: a school machine with no manifest (first run, wiped dir) must still
// show "unknown" in the AdminPanel About section, not a crash.
//
// This is the single Rust command the frontend's About panel needs; it's kept
// here rather than the JS plugin-fs so the read path mirrors the production
// content-read path (no fs capability-scope to configure).
// ──────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn get_content_manifest_version(app: tauri::AppHandle) -> String {
    let paths = app.path();
    let manifest = match paths.app_data_dir() {
        Ok(data_dir) => data_dir
            .join("tusome")
            .join("content")
            .join("manifest.json"),
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

    // Phase 7 manifest uses `bundleVersion` (camelCase). Fall back to a legacy
    // `version` for any manifest written before this work unit.
    if let Some(v) = parsed.get("bundleVersion") {
        if let Some(s) = v.as_str() {
            return s.to_string();
        }
        if let Some(n) = v.as_number() {
            return n.to_string();
        }
    }
    match parsed.get("version") {
        Some(serde_json::Value::String(v)) => v.clone(),
        // A numeric version (e.g. 2) is stringified so the panel shows "2".
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => "unknown".to_string(),
    }
}

// ──────────────────────────────────────────────────────────────────────────
// resolve_content_path — resolve a path RELATIVE to the content dir to an
// absolute filesystem path, so the frontend can `convertFileSrc()` it (the
// PhET iframe needs a real URL, not a Tauri invoke).
//
// Same fallback order as `read_content_packs`: writable app-data content dir
// (the one USB updates write to and the first-run seed populates) → bundled
// resources → dev repo-root. Returns the first that exists, or null so the
// frontend can show a "sim not available" state instead of crashing.
// ──────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn resolve_content_path(app: tauri::AppHandle, rel: String) -> Option<String> {
    let paths = app.path();
    let rel_path = std::path::Path::new(&rel);

    // 1. Writable content dir (post-seed / post-USB-update).
    if let Ok(data_dir) = paths.app_data_dir() {
        let p = data_dir.join("tusome").join("content").join(rel_path);
        if p.exists() {
            return Some(p.display().to_string());
        }
    }
    // 2. Bundled resources fallback.
    if let Ok(res_dir) = paths.resource_dir() {
        let p = res_dir.join("content").join(rel_path);
        if p.exists() {
            return Some(p.display().to_string());
        }
    }
    // 3. Dev-only repo-root fallback. `cargo run` sets CWD to the crate root
    //    (src-tauri/), not the repo root — see the matching comment in
    //    `read_content_packs` above. CARGO_MANIFEST_DIR is the reliable anchor.
    #[cfg(debug_assertions)]
    {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
        let p = repo_root.join("content").join(rel_path);
        if p.exists() {
            return Some(p.display().to_string());
        }
    }
    None
}

// ──────────────────────────────────────────────────────────────────────────
// First-run seed: copy bundled content → writable content dir, but only if the
// writable dir is empty. That preserves any USB-delivered packs already there
// (Phase 5) — we never overwrite a pack the admin dropped on the machine with
// an older one. After an app update, newer bundled packs and sims are synced in.
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
    let target = data_dir.join("tusome").join("content");

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

    // The app version whose bundled content this dir was last synced from.
    // Written only after a successful seed, so a failed/partial seed retries.
    let version = app.package_info().version.to_string();
    let stamp = target.join(".seeded-version");

    // Don't clobber a populated dir — a re-seed on a later launch must not wipe
    // USB-delivered content or updated packs. But a binary update ships new sims
    // and packs in its bundled resources, which this dir would otherwise shadow
    // forever. So once per app version: refresh sims (binary-owned, never
    // USB-delivered) and pull in only strictly-newer bundled packs through the
    // same atomic, version-gated apply the USB channel uses.
    if has_packs(&target) {
        if fs::read_to_string(&stamp).is_ok_and(|v| v == version) {
            return;
        }
        let sims = source.join("sims");
        if sims.exists() {
            if let Err(e) = copy_tree(&sims, &target.join("sims")) {
                eprintln!("[seed] failed to refresh sims: {e}");
                return;
            }
        }
        if let Some(bundled) = updates::build_manifest_for_dir(&source) {
            let r = updates::apply_manifest(&target, &source, &bundled, "seed");
            if r.events.iter().any(|e| e.outcome == "fail") {
                eprintln!("[seed] failed to apply bundled packs: {:?}", r.events);
                return;
            }
        }
        let _ = fs::write(&stamp, &version);
        return;
    }

    if let Err(e) = copy_tree(&source, &target) {
        eprintln!(
            "[seed] failed to seed content from {} to {}: {e}",
            source.display(),
            target.display()
        );
        return;
    }
    // Phase 7: materialise the content manifest over the just-seeded packs so
    // the USB update channel has a local baseline to diff against. Only written
    // when the manifest is missing (mirrors the "don't clobber populated dir"
    // rule above — a USB-delivered manifest must never be overwritten by seed).
    let manifest_path = target.join("manifest.json");
    if !manifest_path.exists() {
        if let Some(bundle) = updates::build_manifest_for_dir(&target) {
            if let Err(e) = updates::write_manifest(&target, &bundle) {
                eprintln!("[seed] failed to write content manifest: {e}");
                return;
            }
        }
    }
    let _ = fs::write(&stamp, &version);
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
