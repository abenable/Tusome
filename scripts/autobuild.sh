#!/usr/bin/env bash
# Run the autonomous build loop in the background, logging to docs/build-reports/.
# Usage:  ./scripts/autobuild.sh "<task description>"
# Watch:  tail -f docs/build-reports/autobuild-<stamp>-<slug>.log
set -euo pipefail

TASK="${1:?usage: ./scripts/autobuild.sh \"<task description>\"}"

mkdir -p docs/build-reports
STAMP="$(date +%Y%m%d-%H%M%S)"
SLUG="$(printf '%s' "$TASK" | tr -c '[:alnum:]-' '-' | tr 'A-Z' 'a-z' | cut -c1-40 | sed 's/-$//')"
LOG="docs/build-reports/autobuild-${STAMP}-${SLUG}.log"
PIDFILE="docs/build-reports/autobuild-${STAMP}.pid"

echo "Starting autonomous build (background)"
echo "  task: $TASK"
echo "  log:  $LOG"
echo "  tail: tail -f \"$LOG\""

nohup opencode run --agent build-orchestrator --auto "$TASK" >> "$LOG" 2>&1 &
PID=$!
echo "$PID" > "$PIDFILE"
echo "  pid:  $PID  (kill with: kill \"$(cat "$PIDFILE")\")"
