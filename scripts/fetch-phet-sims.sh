#!/usr/bin/env bash
# Download the PhET HTML5 sim artifacts into content/sims/, verifying each
# against the sha256 in phet-manifest.json. The .html files are gitignored
# (vendored third-party artifacts); this script makes them reproducible.
#
# Run before `bun tauri build` (the bundler includes content/sims/ as app
# resources) and before `bun tauri dev` (the first-run seed copies them into
# the app-data content dir so the asset protocol can serve them to the iframe).
#
# License: CC BY 4.0 (PhET). Partnership license pending (docs/plan/07, Phase 3).
# Prototype use only — do not redistribute without a signed license.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/content/sims"
MANIFEST="$DIR/phet-manifest.json"
mkdir -p "$DIR"

# Read (id, file, sha256) tuples from the manifest via bun (always available).
mapfile -t ROWS < <(bun -e '
  const m = require(process.argv[1]);
  for (const s of m.sims) console.log([s.id, s.file, s.sha256, m.source].join("\t"));
' "$MANIFEST")

UA="Mozilla/5.0 (CBCLab fetch-phet-sims)"
ok=0; bad=0
for row in "${ROWS[@]}"; do
  IFS=$'\t' read -r id file sha source <<<"$row"
  url="${source//\{id\}/$id}"
  out="$DIR/$file"
  if [ -f "$out" ] && [ "$(sha256sum "$out" | awk '{print $1}')" = "$sha" ]; then
    printf '  %-32s present (sha256 ok)\n' "$id"; ok=$((ok+1)); continue
  fi
  printf '  %-32s downloading…' "$id"
  if curl -sL -A "$UA" -o "$out" "$url" && [ "$(sha256sum "$out" | awk '{print $1}')" = "$sha" ]; then
    printf ' ok\n'; ok=$((ok+1))
  else
    printf ' FAILED (sha256 mismatch or download error)\n'; rm -f "$out"; bad=$((bad+1))
  fi
done

echo "done: $ok ok, $bad failed"
[ "$bad" -eq 0 ]
