-- Phase 7, Work Unit U1: admin-visible update audit trail.
--
-- There is no remote telemetry in this app (docs/plan/07-updates-and-security.md),
-- so the local update_log table is the ONLY record of every USB scan, online
-- content-bundle check, and binary-updater check. The admin screen surfaces it
-- verbatim. Runs once per DB (tauri-plugin-sql gates on the version number);
-- IF NOT EXISTS keeps semantics identical if re-applied defensively.

CREATE TABLE IF NOT EXISTS update_log (
  id      INTEGER PRIMARY KEY,
  ts      TEXT NOT NULL,            -- UTC ISO-8601 (e.g. 2026-08-21T12:00:00Z)
  channel TEXT NOT NULL,            -- 'usb' | 'online' | 'app'
  kind    TEXT NOT NULL,            -- 'sig-verify' | 'copy' | 'hash' | 'swap' | 'parse' | 'check' | 'stage' | 'extract'
  outcome TEXT NOT NULL,            -- 'ok' | 'fail'
  detail  TEXT                      -- human-readable detail; NULL allowed
);

CREATE INDEX IF NOT EXISTS idx_update_log_ts ON update_log(ts DESC);
