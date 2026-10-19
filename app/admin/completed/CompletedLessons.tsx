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
  startOfWeek,
  weekRange,
} from "../../../lib/calendar";
import { AdminNotice, AdminNoticeState } from "../AdminNotice";

type CompletedLesson = {
  id: string;
  startAt: number;
  endAt: number;
  studentName: string | null;
  studentEmail: string | null;
  completedAt: number;
  clearedAt: number | null;
};

type CompletedListAction = "clear" | "restore";
type UndoCompletedListAction = {
  slotId: string;
  action: CompletedListAction;
  successMessage: string;
};

function shiftMonth(date: Date, amount: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + amount, 1);
  return result;
}

export function CompletedLessons({ teacherName }: { teacherName: string }) {
  const [monthStart, setMonthStart] = useState(() => startOfMonth());
  const [lessons, setLessons] = useState<CompletedLesson[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showCleared, setShowCleared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<AdminNoticeState>(null);
  const [undoAction, setUndoAction] = useState<UndoCompletedListAction | null>(null);
  const currentMonth = useMemo(() => startOfMonth(), []);

  const loadLessons = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const range = monthRange(monthStart);
      const currentWeekRange = weekRange(startOfWeek());
      const [response, pendingResponse] = await Promise.all([
        fetch(`/api/admin/completed?from=${range.from}&to=${range.to}`, { cache: "no-store" }),
        fetch(`/api/admin/slots?from=${currentWeekRange.from}&to=${currentWeekRange.to}`, { cache: "no-store" }),
      ]);
      if (response.status === 401 || pendingResponse.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { lessons?: CompletedLesson[]; error?: string };
      const pendingData = (await pendingResponse.json()) as { pendingCount?: number; error?: string };
      if (!response.ok || !data.lessons) throw new Error(data.error ?? "Could not load completed lessons.");
      if (!pendingResponse.ok) throw new Error(pendingData.error ?? "Could not load pending requests.");
      setLessons(data.lessons);
      setPendingCount(pendingData.pendingCount ?? 0);
      if (showLoading) {
        setNotice(null);
        setUndoAction(null);
      }
    } catch (loadError) {
      if (showLoading) {
        setUndoAction(null);
        setNotice({
          tone: "error",
          message: loadError instanceof Error ? loadError.message : "Please try again.",
        });
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [monthStart]);

  useEffect(() => {
    void loadLessons(true);
  }, [loadLessons]);

  useEffect(() => {
    if (!notice) return;
    const duration = notice.canUndo ? 5_000 : notice.tone === "error" ? 6_000 : 3_500;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setUndoAction(null);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  function dismissNotice() {
    setNotice(null);
    setUndoAction(null);
  }

  function showNotice(
    message: string,
    tone: "error" | "success" = "success",
    undo: UndoCompletedListAction | null = null,
  ) {
    setUndoAction(undo);
    setNotice({ message, tone, canUndo: Boolean(undo) });
  }

  async function requestListChange(slotId: string, action: CompletedListAction) {
    const response = await fetch("/api/admin/completed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, action }),
    });
    if (response.status === 401) {
      window.location.assign("/admin/login");
      throw new Error("Your admin session has expired.");
    }
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not update the lesson.");
  }

  async function updateLesson(lesson: CompletedLesson, action: CompletedListAction) {
    setBusyId(lesson.id);
    dismissNotice();
    try {
      await requestListChange(lesson.id, action);
      await loadLessons(false);
      showNotice(
        action === "clear" ? "Lesson cleared from the completed list." : "Lesson restored to the active completed list.",
        "success",
        {
          slotId: lesson.id,
          action: action === "clear" ? "restore" : "clear",
          successMessage: action === "clear" ? "Lesson restored to the active completed list." : "Lesson returned to cleared history.",
        },
      );
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function undoLastAction() {
    if (!undoAction || busyId) return;
    const undo = undoAction;
    setBusyId(undo.slotId);
    dismissNotice();
    try {
      await requestListChange(undo.slotId, undo.action);
      await loadLessons(false);
      showNotice(undo.successMessage);
    } catch (updateError) {
      showNotice(updateError instanceof Error ? updateError.message : "Please try again.", "error");
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
          <Link href="/admin">
            <span className="nav-icon">▦</span><span className="nav-label">Weekly schedule</span>
            {pendingCount ? <span className="nav-badge" aria-label={`${pendingCount} pending requests`}>{pendingCount > 9 ? "9+" : pendingCount}</span> : null}
          </Link>
          <Link className="active" href="/admin/completed"><span className="nav-icon">✓</span><span className="nav-label">Completed lessons</span></Link>
          <Link href="/admin/students"><span className="nav-icon">◉</span><span className="nav-label">Students</span></Link>
          <Link href="/" target="_blank"><span className="nav-icon">↗</span><span className="nav-label">View booking page</span></Link>
          <button className="admin-mobile-signout" onClick={() => void signOut()}><span className="nav-icon">↪</span><span className="nav-label">Sign out</span></button>
        </nav>
        <div className="admin-profile">
          <span>{teacherName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{teacherName}</strong><small>Teacher</small></div>
          <button className="admin-signout" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="admin-content completed-content">
        <header className="admin-topbar">
          <div><p className="eyebrow">Lesson history</p><h1>Completed lessons</h1><p className="admin-description">Clear lessons from your active list without deleting your history.</p></div>
        </header>

        <div className="stat-row completed-stat-row">
          <div><span>Completed</span><strong>{lessons.length}</strong></div>
          <div><span>Active list</span><strong>{activeLessons.length}</strong></div>
          <div><span>Cleared</span><strong>{clearedLessons.length}</strong></div>
          <p>{formatMonth(monthStart)}</p>
        </div>

        <AdminNotice
          notice={notice}
          onUndo={undoAction ? () => void undoLastAction() : undefined}
          onDismiss={dismissNotice}
        />

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
