-- Per-student password login, replacing the original "name picker IS the
-- whole login" decision (00-decisions §4) with a real login/sign-up flow:
-- pick a class, pick your profile card, enter your password.
--
-- Nullable: existing rows created before this migration have no password and
-- cannot log in via the password flow until an admin resets them (out of
-- scope here — this app is still pre-pilot). New accounts always set one at
-- creation (src/db/index.ts createStudent).
ALTER TABLE students ADD COLUMN password_hash TEXT;
