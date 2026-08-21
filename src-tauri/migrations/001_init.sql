CREATE TABLE students (
  id           INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  class_label  TEXT,                       -- 'S2 Blue'
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE progress (
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id     TEXT NOT NULL,              -- matches content pack topic id
  state        TEXT NOT NULL,              -- 'started' | 'completed'
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, topic_id)
);

CREATE TABLE quiz_attempts (
  id           INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id     TEXT NOT NULL,
  quiz_id      TEXT NOT NULL,
  score        INTEGER NOT NULL,
  max_score    INTEGER NOT NULL,
  answers_json TEXT NOT NULL,              -- per-question detail, for teachers
  taken_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_attempts_student ON quiz_attempts(student_id, taken_at);
