"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dateKey,
  formatDay,
  formatLongSlot,
  formatMonth,
  monthRange,
  slotDateKey,
  startOfMonth,
} from "../../../lib/calendar";

type CompletedLesson = {
  id: string;
  startAt: number;
  endAt: number;
  studentName: string | null;
  studentEmail: string | null;
  completedAt: number;
  clearedAt: number | null;
};

function shiftMonth(date: Date, amount: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + amount, 1);
  return result;
}

export function CompletedLessons({ teacherName }: { teacherName: string }) {
  const [monthStart, setMonthStart] = useState(() => startOfMonth());
  const [lessons, setLessons] = useState<CompletedLesson[]>([]);
  const [showCleared, setShowCleared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"error" | "success">("error");
  const currentMonth = useMemo(() => startOfMonth(), []);

  const loadLessons = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const range = monthRange(monthStart);
      const response = await fetch(`/api/admin/completed?from=${range.from}&to=${range.to}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { lessons?: CompletedLesson[]; error?: string };
      if (!response.ok || !data.lessons) throw new Error(data.error ?? "Could not load completed lessons.");
      setLessons(data.lessons);
      if (showLoading) setNotice("");
    } catch (loadError) {
      if (showLoading) {
        setNoticeTone("error");
        setNotice(loadError instanceof Error ? loadError.message : "Please try again.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [monthStart]);

  useEffect(() => {
    void loadLessons(true);
  }, [loadLessons]);

  useEffect(() => {
    const refresh = () => void loadLessons(false);
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
  }, [loadLessons]);

  async function updateLesson(lesson: CompletedLesson, action: "clear" | "restore") {
    if (action === "clear" && !window.confirm("Clear this lesson from the active list? It will remain in your history.")) return;
    setBusyId(lesson.id);
    setNotice("");
    try {
      const response = await fetch("/api/admin/completed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: lesson.id, action }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the lesson.");
      await loadLessons(false);
      setNoticeTone("success");
      setNotice(action === "clear" ? "Lesson cleared from the active list and kept in history." : "Lesson restored to the active list.");
    } catch (updateError) {
      setNoticeTone("error");
      setNotice(updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin/login");
  }

  const activeLessons = lessons.filter((lesson) => !lesson.clearedAt);
  const clearedLessons = lessons.filter((lesson) => lesson.clearedAt);
  const visibleLessons = showCleared ? lessons : activeLessons;
  const groups = visibleLessons.reduce<Array<{ key: string; lessons: CompletedLesson[] }>>((result, lesson) => {
    const key = slotDateKey(lesson.startAt);
    const existing = result.find((group) => group.key === key);
    if (existing) existing.lessons.push(lesson);
    else result.push({ key, lessons: [lesson] });
    return result;
  }, []);

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="wordmark admin-wordmark" href="/admin"><span className="wordmark-mark inverse">A</span><span>Arsenios&apos; Booking Page</span></Link>
        <nav>
          <Link href="/admin"><span>▦</span> Weekly schedule</Link>
          <Link className="active" href="/admin/completed"><span>✓</span> Completed lessons</Link>
          <Link href="/" target="_blank"><span>↗</span> View booking page</Link>
          <button className="admin-mobile-signout" onClick={() => void signOut()}><span>↪</span> Sign out</button>
        </nav>
        <div className="admin-profile">
          <span>{teacherName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{teacherName}</strong><small>Teacher</small></div>
          <button className="admin-signout" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="admin-content completed-content">
        <header className="admin-topbar">
          <div><p className="eyebrow">Lesson history</p><h1>Completed lessons</h1><p>Clear lessons from your active list without deleting your history.</p></div>
        </header>

        <div className="stat-row completed-stat-row">
          <div><span>Completed</span><strong>{lessons.length}</strong></div>
          <div><span>Active list</span><strong>{activeLessons.length}</strong></div>
          <div><span>Cleared</span><strong>{clearedLessons.length}</strong></div>
          <p>{formatMonth(monthStart)}</p>
        </div>

        {notice ? <div className={`admin-notice standalone-notice ${noticeTone}`} role="status">{notice}</div> : null}

        <section className="completed-card">
          <div className="month-toolbar">
            <button className="icon-button" onClick={() => setMonthStart((current) => shiftMonth(current, -1))} aria-label="Previous month">←</button>
            <div><span className="toolbar-kicker">Completed lessons</span><strong>{formatMonth(monthStart)}</strong></div>
            <button className="icon-button" onClick={() => setMonthStart((current) => shiftMonth(current, 1))} aria-label="Next month">→</button>
            <button className="return-today-button" onClick={() => setMonthStart(startOfMonth())} disabled={dateKey(monthStart) === dateKey(currentMonth)}>This month</button>
          </div>

          <div className="completed-filters">
            <p>{activeLessons.length} {activeLessons.length === 1 ? "lesson" : "lessons"} in your active list</p>
            <label><input type="checkbox" checked={showCleared} onChange={(event) => setShowCleared(event.target.checked)} /> Show cleared history</label>
          </div>

          <div className={`completed-groups ${loading ? "is-loading" : ""}`}>
            {groups.length ? groups.map((group) => (
              <section className="completed-day-group" key={group.key}>
                <h2>{formatDay(new Date(group.lessons[0].startAt))}</h2>
                {group.lessons.map((lesson) => (
                  <article className={`completed-row ${lesson.clearedAt ? "is-cleared" : ""}`} key={lesson.id}>
                    <span className="completed-check">✓</span>
                    <div className="completed-person">
                      <strong>{lesson.studentName ?? "Student"}</strong>
                      <span>{formatLongSlot(lesson.startAt, lesson.endAt)}</span>
                      {lesson.studentEmail ? <a href={`mailto:${lesson.studentEmail}`}>{lesson.studentEmail}</a> : null}
                    </div>
                    {lesson.clearedAt ? <span className="cleared-label">Cleared</span> : null}
                    <div className="completed-actions">
                      <a className="secondary-button" href={`/api/admin/calendar?slot=${encodeURIComponent(lesson.id)}`}>↓ .ics</a>
                      <button className={lesson.clearedAt ? "secondary-button" : "clear-button"} onClick={() => void updateLesson(lesson, lesson.clearedAt ? "restore" : "clear")} disabled={busyId === lesson.id}>
                        {lesson.clearedAt ? "Restore" : "Clear from list"}
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            )) : <div className="completed-empty"><span>✓</span><h2>No completed lessons here yet</h2><p>Mark a confirmed lesson as completed from the weekly calendar.</p></div>}
          </div>
        </section>
      </section>
    </main>
  );
}
