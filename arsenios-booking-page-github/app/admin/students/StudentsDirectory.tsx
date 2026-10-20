"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatLongSlot } from "../../../lib/calendar";

type StudentLesson = {
  id: string;
  startAt: number;
  endAt: number;
  status: "pending" | "scheduled" | "completed";
  completedAt: number | null;
  clearedAt: number | null;
};

type StudentRecord = {
  key: string;
  name: string;
  email: string;
  lessons: StudentLesson[];
  completedCount: number;
  upcomingCount: number;
  pendingCount: number;
  latestBookingAt: number;
  note: string;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ")
    .replace(/\s+/g, " ")
    .trim();
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("") || "S";
}

function lessonStatus(lesson: StudentLesson) {
  if (lesson.status === "pending") return "Pending approval";
  if (lesson.status === "scheduled") return "Scheduled";
  return lesson.clearedAt ? "Completed · Cleared" : "Completed · Active list";
}

export function StudentsDirectory({ teacherName }: { teacherName: string }) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [query, setQuery] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const loadStudents = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/admin/students", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as {
        students?: StudentRecord[];
        pendingCount?: number;
        completedCount?: number;
        error?: string;
      };
      if (!response.ok || !data.students) {
        throw new Error(data.error ?? "Could not load students.");
      }
      setStudents(data.students);
      setPendingCount(data.pendingCount ?? 0);
      setCompletedCount(data.completedCount ?? 0);
      setExpandedKey((current) =>
        data.students?.some((student) => student.key === current) ? current : null,
      );
      setError("");
    } catch (loadError) {
      if (showLoading) {
        setError(loadError instanceof Error ? loadError.message : "Please try again.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStudents(true);
  }, [loadStudents]);

  useEffect(() => {
    document.title = pendingCount
      ? `(${pendingCount}) Arsenios Admin`
      : "Arsenios Admin";
    return () => {
      document.title = "Arsenios' Booking Page";
    };
  }, [pendingCount]);

  useEffect(() => {
    const refresh = () => void loadStudents(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 45_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadStudents]);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return students;
    return students.filter((student) =>
      normalizeSearch(`${student.name} ${student.email}`).includes(normalizedQuery),
    );
  }, [query, students]);

  const upcomingCount = students.reduce(
    (total, student) => total + student.upcomingCount,
    0,
  );

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin/login");
  }

  function toggleStudent(student: StudentRecord) {
    if (expandedKey === student.key) {
      setExpandedKey(null);
      setNoteDraft("");
    } else {
      setExpandedKey(student.key);
      setNoteDraft(student.note);
    }
    setNoteStatus("idle");
  }

  async function saveStudentNote(student: StudentRecord) {
    setNoteStatus("saving");
    try {
      const response = await fetch("/api/admin/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: student.email, note: noteDraft }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { note?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save this note.");
      const savedNote = data.note ?? "";
      setNoteDraft(savedNote);
      setStudents((current) => current.map((record) =>
        record.key === student.key ? { ...record, note: savedNote } : record,
      ));
      setNoteStatus("saved");
    } catch {
      setNoteStatus("error");
    }
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="wordmark admin-wordmark" href="/admin">
          <span className="wordmark-mark inverse">A</span>
          <span>Arsenios&apos; Booking Page</span>
        </Link>
        <nav>
          <Link href="/admin">
            <span className="nav-icon">▦</span><span className="nav-label">Weekly schedule</span>
            {pendingCount ? <span className="nav-badge" aria-label={`${pendingCount} pending requests`}>{pendingCount > 9 ? "9+" : pendingCount}</span> : null}
          </Link>
          <Link href="/admin/completed"><span className="nav-icon">✓</span><span className="nav-label">Completed lessons</span></Link>
          <Link className="active" href="/admin/students"><span className="nav-icon">◉</span><span className="nav-label">Students</span></Link>
          <Link href="/" target="_blank"><span className="nav-icon">↗</span><span className="nav-label">View booking page</span></Link>
          <button className="admin-mobile-signout" onClick={() => void signOut()}><span className="nav-icon">↪</span><span className="nav-label">Sign out</span></button>
        </nav>
        <div className="admin-profile">
          <span>{teacherName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{teacherName}</strong><small>Teacher</small></div>
          <button className="admin-signout" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="admin-content students-content">
        <header className="admin-topbar">
          <div><p className="eyebrow">Directory</p><h1>Students</h1></div>
        </header>

        <div className="stat-row students-stat-row">
          <div><span>Students</span><strong>{students.length}</strong></div>
          <div><span>Completed</span><strong>{completedCount}</strong></div>
          <div><span>Upcoming</span><strong>{upcomingCount}</strong></div>
        </div>

        <section className="students-card">
          <div className="students-toolbar">
            <div className="student-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search students by name or email"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or email"
                type="search"
                value={query}
              />
              {query ? <button onClick={() => setQuery("")} type="button" aria-label="Clear search">×</button> : null}
            </div>
            <span>{filteredStudents.length} {filteredStudents.length === 1 ? "student" : "students"}</span>
          </div>

          {error ? (
            <div className="students-empty error-state">
              <p>{error}</p>
              <button className="secondary-button" onClick={() => void loadStudents(true)}>Try again</button>
            </div>
          ) : (
            <div className={`students-list ${loading ? "is-loading" : ""}`}>
              {filteredStudents.length ? filteredStudents.map((student) => {
                const expanded = expandedKey === student.key;
                const latestLesson = student.lessons[0];
                return (
                  <article className={`student-record ${expanded ? "is-expanded" : ""}`} key={student.key}>
                    <button
                      className="student-summary"
                      onClick={() => toggleStudent(student)}
                      type="button"
                      aria-expanded={expanded}
                    >
                      <span className="student-avatar">{initials(student.name)}</span>
                      <span className="student-identity"><strong>{student.name}</strong><small>{student.email}</small></span>
                      <span className="student-metric"><strong>{student.lessons.length}</strong><small>Lessons</small></span>
                      <span className="student-metric"><strong>{student.completedCount}</strong><small>Completed</small></span>
                      <span className="student-last"><small>Latest lesson</small><strong>{latestLesson ? formatLongSlot(latestLesson.startAt, latestLesson.endAt) : "—"}</strong></span>
                      <span className="student-chevron" aria-hidden="true">⌄</span>
                    </button>

                    {expanded ? (
                      <div className="student-history">
                        <div className="student-note-panel">
                          <div>
                            <strong>Private note</strong>
                            <small>Only visible to you</small>
                          </div>
                          <textarea
                            aria-label={`Private note about ${student.name}`}
                            maxLength={2000}
                            onChange={(event) => {
                              setNoteDraft(event.target.value);
                              setNoteStatus("idle");
                            }}
                            placeholder="Add anything you want to remember about this student…"
                            rows={3}
                            value={noteDraft}
                          />
                          <div className="student-note-actions">
                            <span>
                              {noteStatus === "saved" ? "Saved" : noteStatus === "error" ? "Could not save. Please try again." : `${noteDraft.length}/2000`}
                            </span>
                            <button
                              className="secondary-button"
                              disabled={noteStatus === "saving" || noteDraft.trim() === student.note}
                              onClick={() => void saveStudentNote(student)}
                              type="button"
                            >
                              {noteStatus === "saving" ? "Saving…" : "Save note"}
                            </button>
                          </div>
                        </div>
                        <div className="student-history-heading">
                          <strong>Lesson history</strong>
                          <a href={`mailto:${student.email}`}>Email student</a>
                        </div>
                        {student.lessons.length ? student.lessons.map((lesson) => (
                          <div className="student-history-row" key={lesson.id}>
                            <span className={`student-lesson-mark ${lesson.status}`}>{lesson.status === "completed" ? "✓" : lesson.status === "pending" ? "…" : "•"}</span>
                            <span><strong>{formatLongSlot(lesson.startAt, lesson.endAt)}</strong><small>{lessonStatus(lesson)}</small></span>
                            {lesson.status === "pending" ? <span className="student-no-ics">—</span> : <a href={`/api/admin/calendar?slot=${encodeURIComponent(lesson.id)}`}>↓ .ics</a>}
                          </div>
                        )) : <p className="student-no-history">No lessons yet.</p>}
                      </div>
                    ) : null}
                  </article>
                );
              }) : (
                <div className="students-empty">
                  <span>{query ? "No students match that search." : "Student records will appear after someone books."}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
