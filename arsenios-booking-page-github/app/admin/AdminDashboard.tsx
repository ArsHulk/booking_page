"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  AdminSlot,
  dateKey,
  formatDay,
  formatLongSlot,
  formatTime,
  formatWeek,
  minutesInTeacherZone,
  rowLabel,
  slotDateKey,
  startOfWeek,
  timeRows,
  timestampFor,
  weekDays,
  weekRange,
} from "../../lib/calendar";

const ROW_HEIGHT = 40;
const REFRESH_INTERVAL = 45_000;

export function AdminDashboard({ teacherName }: { teacherName: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [activeDay, setActiveDay] = useState(() => Math.max(0, (new Date().getDay() || 7) - 1));
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"error" | "success">("error");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const calendarScroll = useRef<HTMLDivElement | null>(null);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const selected = slots.find((slot) => slot.id === selectedId) ?? null;
  const pending = slots.filter((slot) => slot.status === "pending");
  const confirmed = slots.filter((slot) => slot.status === "confirmed");
  const scheduled = confirmed.filter((slot) => !slot.completedAt);
  const completed = confirmed.filter((slot) => slot.completedAt);

  const loadSlots = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const range = weekRange(weekStart);
      const response = await fetch(`/api/admin/slots?from=${range.from}&to=${range.to}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { slots?: AdminSlot[]; pendingCount?: number; error?: string };
      if (!response.ok || !data.slots) throw new Error(data.error ?? "Could not load this week.");
      setSlots(data.slots);
      setPendingCount(data.pendingCount ?? 0);
      setSelectedId((current) => (data.slots?.some((slot) => slot.id === current) ? current : null));
      if (showLoading) setNotice("");
    } catch (loadError) {
      if (showLoading) {
        setNoticeTone("error");
        setNotice(loadError instanceof Error ? loadError.message : "Please try again.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadSlots(true);
  }, [loadSlots]);

  useEffect(() => {
    const refresh = () => {
      setNow(Date.now());
      void loadSlots(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, REFRESH_INTERVAL);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadSlots]);

  useEffect(() => {
    const scrollArea = calendarScroll.current;
    if (!scrollArea) return;
    const isCurrentWeek = dateKey(weekStart) === dateKey(startOfWeek());
    const targetMinutes = isCurrentWeek
      ? Math.max(timeRows[0], minutesInTeacherZone(Date.now()) - 90)
      : timeRows[0];
    const targetRow = Math.max(0, (targetMinutes - timeRows[0]) / 30);
    const frame = window.requestAnimationFrame(() => {
      scrollArea.scrollTop = targetRow * ROW_HEIGHT;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [weekStart]);

  function changeWeek(amount: number) {
    setWeekStart((current) => addDays(current, amount * 7));
    setActiveDay(0);
    setSelectedId(null);
  }

  function returnToToday() {
    const today = new Date();
    setNow(today.getTime());
    setWeekStart(startOfWeek(today));
    setActiveDay(Math.max(0, (today.getDay() || 7) - 1));
    setSelectedId(null);
  }

  function toggleEditing() {
    setIsEditing((current) => {
      const next = !current;
      if (!next && selected?.status === "available") setSelectedId(null);
      return next;
    });
  }

  function slotAt(day: Date, minutes: number) {
    const startAt = timestampFor(day, minutes);
    return slots.find((slot) => startAt < slot.endAt && startAt + 60 * 60 * 1000 > slot.startAt);
  }

  async function toggleAvailabilityAt(startAt: number) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update availability.");
      await loadSlots(false);
    } catch (updateError) {
      setNoticeTone("error");
      setNotice(updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggleAvailability(day: Date, minutes: number) {
    return toggleAvailabilityAt(timestampFor(day, minutes));
  }

  async function copyPreviousWeek() {
    if (busy) return;
    const sourceWeek = addDays(weekStart, -7);
    const confirmedCopy = window.confirm(
      `Copy last week's lesson times from ${formatWeek(sourceWeek)} into ${formatWeek(weekStart)}? Student names and bookings will not be copied, and existing slots will stay unchanged.`,
    );
    if (!confirmedCopy) return;

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy_previous_week",
          weekStart: dateKey(weekStart),
        }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { copied?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not copy last week's availability.");
      await loadSlots(false);
      setNoticeTone("success");
      if (!data.copied && !data.skipped) {
        setNotice("There were no lesson times to copy from last week.");
      } else {
        setNotice(
          `${data.copied ?? 0} ${data.copied === 1 ? "slot" : "slots"} copied${data.skipped ? `; ${data.skipped} skipped because the time was past or already occupied` : ""}.`,
        );
      }
    } catch (updateError) {
      setNoticeTone("error");
      setNotice(updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updateBooking(slot: AdminSlot, action: "approve" | "release") {
    if (busy) return;
    const label = slot.status === "confirmed" ? "cancel this confirmed lesson" : "reject this request";
    if (action === "release" && !window.confirm(`Are you sure you want to ${label}?`)) return;

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, action }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { error?: string; emailWarning?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the booking.");
      setSelectedId(null);
      await loadSlots(false);
      setNoticeTone("success");
      setNotice(
        data.emailWarning ??
          (action === "approve"
            ? "Lesson confirmed and confirmation email sent."
            : slot.status === "confirmed"
              ? "Lesson cancelled and cancellation email sent."
              : "Request rejected and email sent."),
      );
    } catch (updateError) {
      setNoticeTone("error");
      setNotice(updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function updateCompletion(slot: AdminSlot, action: "complete" | "uncomplete") {
    if (busy) return;
    if (action === "complete" && slot.startAt > Date.now()) {
      const proceed = window.confirm("This lesson has not started yet. Mark it as completed anyway?");
      if (!proceed) return;
    }
    if (action === "uncomplete" && !window.confirm("Move this lesson back to scheduled?")) return;

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/completed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, action }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the lesson.");
      await loadSlots(false);
      setNoticeTone("success");
      setNotice(action === "complete" ? "Lesson added to Completed lessons." : "Lesson moved back to scheduled.");
    } catch (updateError) {
      setNoticeTone("error");
      setNotice(updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleTouchEnd(event: React.TouchEvent) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0 && activeDay < 6) setActiveDay(activeDay + 1);
    if (dx > 0 && activeDay > 0) setActiveDay(activeDay - 1);
  }

  const range = weekRange(weekStart);
  const exportHref = `/api/admin/calendar?from=${range.from}&to=${range.to}`;
  const todayKey = slotDateKey(now);
  const currentMinutes = minutesInTeacherZone(now);
  const currentLineTop = (currentMinutes - timeRows[0]) / 30 * ROW_HEIGHT;
  const showCurrentTime = currentMinutes >= timeRows[0] && currentMinutes < timeRows[timeRows.length - 1] + 30;
  const isCurrentWeek = dateKey(weekStart) === dateKey(startOfWeek(new Date(now)));
  const activeDayKey = dateKey(days[activeDay]);

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.replace("/admin/login");
  }

  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="wordmark admin-wordmark" href="/admin">
          <span className="wordmark-mark inverse">A</span>
          <span>Arsenios&apos; Booking Page</span>
        </Link>
        <nav>
          <Link className="active" href="/admin">
            <span className="nav-icon">▦</span><span className="nav-label">Weekly schedule</span>
            {pendingCount ? <span className="nav-badge" aria-label={`${pendingCount} pending requests`}>{pendingCount > 9 ? "9+" : pendingCount}</span> : null}
          </Link>
          <Link href="/admin/completed"><span className="nav-icon">✓</span><span className="nav-label">Completed lessons</span></Link>
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

      <section className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Weekly schedule</p>
            <h1>Your schedule</h1>
            {isEditing ? <p className="admin-description">Choose a future half-hour start time to offer a one-hour lesson.</p> : null}
          </div>
          <div className="admin-topbar-actions">
            <button className="secondary-button copy-week-button" onClick={() => void copyPreviousWeek()} disabled={busy} type="button">Copy last week</button>
            <button className={isEditing ? "primary-button" : "secondary-button"} onClick={toggleEditing} type="button">
              {isEditing ? "Done editing" : "Edit availability"}
            </button>
            <a className="secondary-button export-button" href={exportHref}>↓ Download week</a>
          </div>
        </header>

        <div className="stat-row admin-stat-row">
          <div><span>Pending</span><strong>{pending.length}</strong></div>
          <div><span>Scheduled</span><strong>{scheduled.length}</strong></div>
          <div><span>Completed</span><strong>{completed.length}</strong></div>
          <div><span>Open slots</span><strong>{slots.filter((slot) => slot.status === "available").length}</strong></div>
          <p>Each new week starts blank.</p>
        </div>

        {notice ? <div className={`admin-notice standalone-notice ${noticeTone}`} role="status">{notice}</div> : null}

        <section className={`admin-overview-grid ${isEditing ? "admin-overview-editing" : ""}`} aria-label="Weekly lesson overview">
          <article className="admin-overview-card pending-overview">
            <header><div><h2>Pending requests</h2></div><strong>{pending.length}</strong></header>
            {pending.length ? (
              <div className="overview-list">
                {pending.map((slot) => (
                  <div className="overview-row" key={slot.id}>
                    <button className="overview-lesson" onClick={() => setSelectedId(slot.id)}>
                      <strong>{slot.studentName ?? "Student"}</strong>
                      <span>{formatDay(new Date(slot.startAt))} · {formatTime(slot.startAt)}</span>
                    </button>
                    <div className="overview-actions">
                      <button className="mini-approve" onClick={() => void updateBooking(slot, "approve")} disabled={busy}>Approve</button>
                      <button className="mini-reject" onClick={() => void updateBooking(slot, "release")} disabled={busy}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="overview-empty">No requests are waiting.</p>}
          </article>

          <article className="admin-overview-card confirmed-overview">
            <header><div><h2>Confirmed this week</h2></div><strong>{confirmed.length}</strong></header>
            {confirmed.length ? (
              <div className="overview-list">
                {confirmed.map((slot) => (
                  <button className="confirmed-list-row" key={slot.id} onClick={() => setSelectedId(slot.id)}>
                    <span className={`lesson-check ${slot.completedAt ? "is-complete" : ""}`}>{slot.completedAt ? "✓" : ""}</span>
                    <span><strong>{slot.studentName ?? "Student"}</strong><small>{formatDay(new Date(slot.startAt))} · {formatTime(slot.startAt)}</small></span>
                    <em>{slot.completedAt ? "Completed" : "Scheduled"}</em>
                  </button>
                ))}
              </div>
            ) : <p className="overview-empty">No confirmed lessons this week.</p>}
          </article>
        </section>

        <section className={`admin-calendar-card ${!isEditing ? "admin-calendar-readonly" : ""}`}>
          <div className="week-toolbar admin-toolbar">
            <button className="icon-button" onClick={() => changeWeek(-1)} aria-label="Previous week">←</button>
            <div><span className="toolbar-kicker">{isEditing ? "Editing availability" : "Schedule"}</span><strong>{formatWeek(weekStart)}</strong></div>
            <button className="icon-button" onClick={() => changeWeek(1)} aria-label="Next week">→</button>
            <button className="return-today-button admin-today-button" onClick={returnToToday} disabled={isCurrentWeek && activeDayKey === todayKey} type="button">Today</button>
          </div>

          <div className="mobile-day-tabs admin-day-tabs" aria-label="Choose a day">
            {days.map((day, index) => (
              <button key={dateKey(day)} className={`${index === activeDay ? "active" : ""} ${dateKey(day) === todayKey ? "is-today" : ""}`} onClick={() => setActiveDay(index)}>
                <span>{formatDay(day, false)}</span><strong>{day.getDate()}</strong>
              </button>
            ))}
          </div>

          {isEditing ? <div className="edit-mode-notice" role="status"><strong>Editing availability</strong><span>Select a future half-hour start time. Past times stay locked.</span></div> : null}

          <div
            className={`week-calendar admin-calendar ${isEditing ? "is-editing" : "is-schedule"} ${loading ? "is-loading" : ""}`}
            onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
            onTouchEnd={handleTouchEnd}
          >
            <div className="calendar-header-row">
              <div className="time-heading">Time</div>
              {days.map((day, index) => (
                <div className={`day-heading ${index === activeDay ? "mobile-active" : ""} ${dateKey(day) === todayKey ? "is-today" : ""}`} key={dateKey(day)}>
                  <span>{formatDay(day, false)}</span><strong>{day.getDate()}</strong>
                </div>
              ))}
            </div>

            <div className="calendar-scroll" ref={calendarScroll}>
              <div className="time-rail">
                {timeRows.map((minutes) => <div key={minutes} style={{ height: ROW_HEIGHT }}>{minutes % 60 === 0 ? rowLabel(minutes) : ""}</div>)}
              </div>

              {days.map((day, index) => {
                const key = dateKey(day);
                const isToday = key === todayKey;
                const daySlots = slots.filter((slot) => slotDateKey(slot.startAt) === key);
                return (
                  <div className={`day-column admin-day-column ${index === activeDay ? "mobile-active" : ""} ${isToday ? "is-today" : ""}`} style={{ height: timeRows.length * ROW_HEIGHT }} key={key}>
                    <div className="grid-lines" aria-hidden="true" />
                    {isToday && showCurrentTime ? <div className="current-time-line admin-current-time" style={{ top: currentLineTop }} aria-label={`Current time ${formatTime(now)}`}><span>{formatTime(now)}</span></div> : null}
                    {timeRows.slice(0, -1).map((minutes, row) => {
                      const occupied = slotAt(day, minutes);
                      const startsBeforeNow = timestampFor(day, minutes) < Date.now();
                      return (
                        <button
                          className={`availability-trigger ${startsBeforeNow ? "is-past" : ""}`}
                          disabled={!isEditing || Boolean(occupied) || startsBeforeNow || busy}
                          key={minutes}
                          onClick={() => void toggleAvailability(day, minutes)}
                          style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
                          aria-label={startsBeforeNow ? `${formatDay(day)} at ${rowLabel(minutes)} is in the past` : `Add availability ${formatDay(day)} at ${rowLabel(minutes)}`}
                          title={isEditing && !occupied && !startsBeforeNow ? "Add a one-hour lesson" : undefined}
                        />
                      );
                    })}
                    {daySlots.map((slot) => {
                      const row = (minutesInTeacherZone(slot.startAt) - timeRows[0]) / 30;
                      if (row < 0 || row >= timeRows.length) return null;
                      const label = slot.status === "available" ? "Available" : slot.studentName ?? "Student";
                      const displayStatus = slot.status === "confirmed" ? (slot.completedAt ? "completed" : "scheduled") : slot.status;
                      return (
                        <button
                          className={`admin-slot ${slot.status} ${slot.completedAt ? "completed" : ""} ${slot.id === selectedId ? "selected" : ""} ${slot.status === "available" && !isEditing ? "is-readonly" : ""}`}
                          key={slot.id}
                          onClick={() => { if (slot.status !== "available" || isEditing) setSelectedId(slot.id); }}
                          style={{ top: row * ROW_HEIGHT + 3, height: ROW_HEIGHT * 2 - 6 }}
                          aria-label={slot.status === "available" && !isEditing ? `Available lesson at ${formatTime(slot.startAt)}` : `Open ${label} at ${formatTime(slot.startAt)}`}
                        >
                          <span>{formatTime(slot.startAt)}</span><strong>{label}</strong>{slot.status !== "available" ? <small>{displayStatus}</small> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {selected ? (
          <section className="booking-inspector" aria-live="polite">
            <button className="inspector-close" onClick={() => setSelectedId(null)} aria-label="Close details">×</button>
            <div>
              <span className={`status-pill ${selected.status} ${selected.completedAt ? "completed" : ""}`}>
                {selected.status === "confirmed" ? (selected.completedAt ? "completed" : "scheduled") : selected.status}
              </span>
              <h2>{selected.studentName ?? "Open lesson slot"}</h2>
              <p>{formatLongSlot(selected.startAt, selected.endAt)}</p>
              {selected.studentEmail ? <a className="student-email" href={`mailto:${selected.studentEmail}`}>{selected.studentEmail}</a> : null}
            </div>
            <div className="inspector-actions">
              {selected.status === "pending" ? <><button className="primary-button" onClick={() => void updateBooking(selected, "approve")} disabled={busy}>Approve request</button><button className="danger-button" onClick={() => void updateBooking(selected, "release")} disabled={busy}>Reject</button></> : null}
              {selected.status === "confirmed" ? (
                <>
                  <a className="secondary-button" href={`/api/admin/calendar?slot=${encodeURIComponent(selected.id)}`}>↓ Calendar invite</a>
                  <button className={selected.completedAt ? "secondary-button" : "complete-button"} onClick={() => void updateCompletion(selected, selected.completedAt ? "uncomplete" : "complete")} disabled={busy}>
                    {selected.completedAt ? "Undo completed" : "✓ Mark completed"}
                  </button>
                  {!selected.completedAt ? <button className="danger-button" onClick={() => void updateBooking(selected, "release")} disabled={busy}>Cancel lesson</button> : null}
                </>
              ) : null}
              {selected.status === "available" && isEditing ? <button className="danger-button" onClick={() => void toggleAvailabilityAt(selected.startAt)} disabled={busy}>Remove availability</button> : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
