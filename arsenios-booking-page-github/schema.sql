CREATE TABLE IF NOT EXISTS booking_slots (
  id TEXT PRIMARY KEY NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  status TEXT DEFAULT 'available' NOT NULL,
  student_name TEXT,
  student_email TEXT,
  completed_at INTEGER,
  cleared_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS booking_slots_start_idx
  ON booking_slots (start_at);

CREATE INDEX IF NOT EXISTS booking_slots_status_idx
  ON booking_slots (status);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  fingerprint TEXT PRIMARY KEY NOT NULL,
  failures INTEGER DEFAULT 0 NOT NULL,
  window_started_at INTEGER NOT NULL,
  locked_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS student_notes (
  student_email TEXT PRIMARY KEY NOT NULL,
  note TEXT DEFAULT '' NOT NULL,
  updated_at INTEGER NOT NULL
);
