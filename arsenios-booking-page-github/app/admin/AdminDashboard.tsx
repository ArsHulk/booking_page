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

export function AdminDashboard({ teacherName }: { teacherName: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [activeDay, setActiveDay] = useState(() => Math.max(0, (new Date().getDay() || 7) - 1));
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const selected = slots.find((slot) => slot.id === selectedId) ?? null;
  const pendingCount = slots.filter((slot) => slot.status === "pending").length;
  const confirmedCount = slots.filter((slot) => slot.status === "confirmed").length;

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const range = weekRange(weekStart);
      const response = await fetch(`/api/admin/slots?from=${range.from}&to=${range.to}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { slots?: AdminSlot[]; error?: string };
      if (!response.ok || !data.slots) throw new Error(data.error ?? "Could not load this week.");
      setSlots(data.slots);
      setSelectedId((current) => (data.slots?.some((slot) => slot.id === current) ? current : null));
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  function changeWeek(amount: number) {
    setWeekStart((current) => addDays(current, amount * 7));
    setActiveDay(0);
    setSelectedId(null);
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
      await loadSlots();
    } catch (updateError) {
      setNotice(updateError instanceof Error ? updateError.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function toggleAvailability(day: Date, minutes: number) {
    return toggleAvailabilityAt(timestampFor(day, minutes));
  }

  async function updateBooking(action: "approve" | "release") {
    if (!selected || busy) return;
    const label = selected.status === "confirmed" ? "cancel this confirmed lesson" : "release this time";
    if (action === "release" && !window.confirm(`Are you sure you want to ${label}?`)) return;

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selected.id, action }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the booking.");
      setSelectedId(null);
      await loadSlots();
    } catch (updateError) {
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
          <Link className="active" href="/admin"><span>▦</span> Weekly schedule</Link>
          <Link href="/" target="_blank"><span>↗</span> View booking page</Link>
          <button className="admin-mobile-signout" onClick={() => void signOut()}><span>↪</span> Sign out</button>
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
            <p className="eyebrow">Weekly availability</p>
            <h1>Your teaching week</h1>
            <p>Click an empty half-hour line to offer a one-hour lesson.</p>
          </div>
          <a className="secondary-button export-button" href={exportHref}>↓ Download week</a>
        </header>

        <div className="stat-row">
          <div><span>Pending</span><strong>{pendingCount}</strong></div>
          <div><span>Confirmed</span><strong>{confirmedCount}</strong></div>
          <div><span>Open slots</span><strong>{slots.filter((slot) => slot.status === "available").length}</strong></div>
          <p>Each new week starts blank.</p>
        </div>

        <section className="admin-calendar-card">
          <div className="week-toolbar admin-toolbar">
            <button className="icon-button" onClick={() => changeWeek(-1)} aria-label="Previous week">←</button>
            <div>
              <span className="toolbar-kicker">Editing</span>
              <strong>{formatWeek(weekStart)}</strong>
            </div>
            <button className="icon-button" onClick={() => changeWeek(1)} aria-label="Next week">→</button>
          </div>

          <div className="mobile-day-tabs admin-day-tabs" aria-label="Choose a day">
            {days.map((day, index) => (
              <button
                key={dateKey(day)}
                className={index === activeDay ? "active" : ""}
                onClick={() => setActiveDay(index)}
              >
                <span>{formatDay(day, false)}</span>
                <strong>{day.getDate()}</strong>
              </button>
            ))}
          </div>

          {notice ? <div className="admin-notice" role="status">{notice}</div> : null}

          <div
            className={`week-calendar admin-calendar ${loading ? "is-loading" : ""}`}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              touchStart.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={handleTouchEnd}
          >
            <div className="calendar-header-row">
              <div className="time-heading">Time</div>
              {days.map((day, index) => (
                <div className={`day-heading ${index === activeDay ? "mobile-active" : ""}`} key={dateKey(day)}>
                  <span>{formatDay(day, false)}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              ))}
            </div>

            <div className="calendar-scroll">
              <div className="time-rail">
                {timeRows.map((minutes) => (
                  <div key={minutes} style={{ height: ROW_HEIGHT }}>
                    {minutes % 60 === 0 ? rowLabel(minutes) : ""}
                  </div>
                ))}
              </div>

              {days.map((day, index) => {
                const key = dateKey(day);
                const daySlots = slots.filter((slot) => slotDateKey(slot.startAt) === key);
                return (
                  <div
                    className={`day-column admin-day-column ${index === activeDay ? "mobile-active" : ""}`}
                    style={{ height: timeRows.length * ROW_HEIGHT }}
                    key={key}
                  >
                    <div className="grid-lines" aria-hidden="true" />
                    {timeRows.slice(0, -1).map((minutes, row) => {
                      const occupied = slotAt(day, minutes);
                      const startsBeforeNow = timestampFor(day, minutes) < Date.now();
                      return (
                        <button
                          className="availability-trigger"
                          disabled={Boolean(occupied) || startsBeforeNow || busy}
                          key={minutes}
                          onClick={() => void toggleAvailability(day, minutes)}
                          style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
                          aria-label={`Add availability ${formatDay(day)} at ${rowLabel(minutes)}`}
                        />
                      );
                    })}

                    {daySlots.map((slot) => {
                      const row = (minutesInTeacherZone(slot.startAt) - timeRows[0]) / 30;
                      if (row < 0 || row >= timeRows.length) return null;
                      const label = slot.status === "available" ? "Available" : slot.studentName ?? "Student";
                      return (
                        <button
                          className={`admin-slot ${slot.status} ${slot.id === selectedId ? "selected" : ""}`}
                          key={slot.id}
                          onClick={() => setSelectedId(slot.id)}
                          style={{ top: row * ROW_HEIGHT + 3, height: ROW_HEIGHT * 2 - 6 }}
                        >
                          <span>{formatTime(slot.startAt)}</span>
                          <strong>{label}</strong>
                          {slot.status !== "available" ? <small>{slot.status}</small> : null}
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
              <span className={`status-pill ${selected.status}`}>{selected.status}</span>
              <h2>{selected.studentName ?? "Open lesson slot"}</h2>
              <p>{formatLongSlot(selected.startAt, selected.endAt)}</p>
            </div>
            <div className="inspector-actions">
              {selected.status === "pending" ? (
                <>
                  <button className="primary-button" onClick={() => void updateBooking("approve")} disabled={busy}>Approve request</button>
                  <button className="danger-button" onClick={() => void updateBooking("release")} disabled={busy}>Reject</button>
                </>
              ) : null}
              {selected.status === "confirmed" ? (
                <>
                  <a className="secondary-button" href={`/api/admin/calendar?slot=${encodeURIComponent(selected.id)}`}>↓ Calendar invite</a>
                  <button className="danger-button" onClick={() => void updateBooking("release")} disabled={busy}>Cancel lesson</button>
                </>
              ) : null}
              {selected.status === "available" ? (
                <button className="danger-button" onClick={() => void toggleAvailabilityAt(selected.startAt)} disabled={busy}>Remove availability</button>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
