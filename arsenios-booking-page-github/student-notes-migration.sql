CREATE TABLE IF NOT EXISTS student_notes (
  student_email TEXT PRIMARY KEY NOT NULL,
  note TEXT DEFAULT '' NOT NULL,
  updated_at INTEGER NOT NULL
);
