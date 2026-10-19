import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bookingSlots = sqliteTable(
  "booking_slots",
  {
    id: text("id").primaryKey(),
    startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", {
      enum: ["available", "pending", "confirmed"],
    })
      .notNull()
      .default("available"),
    studentName: text("student_name"),
    studentEmail: text("student_email"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    clearedAt: integer("cleared_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("booking_slots_start_idx").on(table.startAt),
    index("booking_slots_status_idx").on(table.status),
  ],
);

export const adminLoginAttempts = sqliteTable("admin_login_attempts", {
  fingerprint: text("fingerprint").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: integer("window_started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const studentNotes = sqliteTable("student_notes", {
  studentEmail: text("student_email").primaryKey(),
  note: text("note").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
