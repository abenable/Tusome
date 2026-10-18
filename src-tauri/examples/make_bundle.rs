// Build and sign a content-update bundle (docs/plan/07).
//
//   bun run bundle:content            (from the repo root), or
//   cargo run --release --example make_bundle -- <content-dir> <out-dir>
//
// The signing key comes from the same variables `tauri build` reads:
//   TAURI_SIGNING_PRIVATE_KEY           key file path, or the key itself
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  its password
//
// Writes:
//   <out-dir>/tusome-updates/  copy to the root of a USB stick (USB channel)
//   <out-dir>/bundle.zip       attach to a GitHub release (online channel)
//
// The manifest is built with the app's own `build_manifest_for_dir`, so pack
// hashes match what the app verifies. Before reporting success the tool runs
// the finished bundle through the app's real apply path (`apply_update_bundle`)
// into an empty scratch dir: a bundle that wouldn't install never ships.

use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use base64::Engine;
use tusome_lib::updates::{
    apply_update_bundle, build_manifest_for_dir, copy_pack_dir, verify_manifest_signature,
    CONTENT_PUBKEY,
};

fn main() {
    if let Err(e) = run() {
        eprintln!("make_bundle: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let [_, content, out] = args.as_slice() else {
        return Err("usage: make_bundle <content-dir> <out-dir>".to_string());
    };
    let (content, out) = (PathBuf::from(content), PathBuf::from(out));

    let mut manifest = build_manifest_for_dir(&content)
        .ok_or_else(|| format!("no packs found under {}", content.display()))?;
    manifest.bundle_version = manifest.bundle_version.replacen("seed-", "bundle-", 1);

    let root = out.join("tusome-updates");
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| format!("clear {}: {e}", root.display()))?;
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    for pack in &manifest.packs {
        copy_pack_dir(&content.join(&pack.path), &root.join(&pack.path))
            .map_err(|e| format!("copy {}: {e}", pack.path))?;
    }

    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
    let sig = sign(&manifest_bytes)?;
    if !verify_manifest_signature(&manifest_bytes, sig.as_bytes(), CONTENT_PUBKEY) {
        return Err(
            "signature doesn't verify against the app's CONTENT_PUBKEY (wrong key?)".to_string(),
        );
    }
    fs::write(root.join("manifest.json"), &manifest_bytes).map_err(|e| e.to_string())?;
    fs::write(root.join("manifest.json.sig"), &sig).map_err(|e| e.to_string())?;

    let scratch = out.join(".install-check");
    let _ = fs::remove_dir_all(&scratch);
    fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    let check = apply_update_bundle(&scratch, &root, CONTENT_PUBKEY, "bundle-check");
    let _ = fs::remove_dir_all(&scratch);
    if check.applied.len() != manifest.packs.len() {
        let why: Vec<String> = check
            .events
            .iter()
            .filter(|e| e.outcome == "fail")
            .map(|e| format!("{}: {}", e.kind, e.detail))
            .collect();
        return Err(format!(
            "bundle failed its install check ({} of {} packs applied): {}",
            check.applied.len(),
            manifest.packs.len(),
            why.join("; ")
        ));
    }

    let zip_path = out.join("bundle.zip");
    write_zip(&root, &zip_path).map_err(|e| format!("zip: {e}"))?;

    println!(
        "{} packs, {}\n  {}\n  {}",
        manifest.packs.len(),
        manifest.bundle_version,
        root.display(),
        zip_path.display()
    );
    Ok(())
}

/// Detached minisign signature in the text form `verify_manifest_signature`
/// decodes. Tauri stores keys base64-wrapped, so unwrap first.
fn sign(data: &[u8]) -> Result<String, String> {
    let key = std::env::var("TAURI_SIGNING_PRIVATE_KEY")
        .map_err(|_| "set TAURI_SIGNING_PRIVATE_KEY (key file path or contents)".to_string())?;
    let key = if Path::new(&key).is_file() {
        fs::read_to_string(&key).map_err(|e| e.to_string())?
    } else {
        key
    };
    let password = std::env::var("TAURI_SIGNING_PRIVATE_KEY_PASSWORD").ok();
    let text = base64::engine::general_purpose::STANDARD
        .decode(key.trim())
        .map_err(|e| format!("key isn't base64: {e}"))?;
    let text = String::from_utf8(text).map_err(|e| e.to_string())?;
    let sk = minisign::SecretKeyBox::from_string(&text)
        .and_then(|b| b.into_secret_key(password))
        .map_err(|e| format!("can't open key (wrong password?): {e}"))?;
    let sig = minisign::sign(None, &sk, Cursor::new(data), None, None)
        .map_err(|e| format!("sign: {e}"))?;
    Ok(sig.to_string())
}

/// Zip `root`'s contents with manifest.json at the archive root — the shape
/// the online channel extracts and verifies.
fn write_zip(root: &Path, zip_path: &Path) -> std::io::Result<()> {
    let mut files = Vec::new();
    collect(root, &mut files)?;
    files.sort();
    let mut zip = zip::ZipWriter::new(fs::File::create(zip_path)?);
    let opts = zip::write::FileOptions::default();
    for abs in files {
        let rel = abs
            .strip_prefix(root)
            .unwrap_or(&abs)
            .to_string_lossy()
            .replace('\\', "/");
        zip.start_file(rel, opts)?;
        zip.write_all(&fs::read(&abs)?)?;
    }
    zip.finish()?;
    Ok(())
}

fn collect(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            collect(&path, out)?;
        } else {
            out.push(path);
        }
    }
    Ok(())
}
