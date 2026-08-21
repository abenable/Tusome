-- Phase 5, Work Unit W1: app settings + quiz seed column.
--
-- Runs exactly once per DB (tauri-plugin-sql gates on the version number), so
-- plain CREATE/ALTER is fine; IF NOT EXISTS is added defensively where it keeps
-- semantics identical. Never edit 001_init.sql — append here.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Nullable INTEGER: a NULL seed marks a pre-Phase-5 attempt whose question
-- order was not randomised. New attempts record the seed used to shuffle.
ALTER TABLE quiz_attempts ADD COLUMN seed INTEGER;
