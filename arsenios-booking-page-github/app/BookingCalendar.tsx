"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  dateKey,
  formatDay,
  formatTime,
  formatWeek,
  minutesInTeacherZone,
  PublicSlot,
  rowLabel,
  slotDateKey,
  startOfWeek,
  timeRows,
  weekDays,
  weekRange,
} from "../lib/calendar";

const ROW_HEIGHT = 40;

export function BookingCalendar() {
  const currentWeek = useMemo(() => startOfWeek(), []);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [activeDay, setActiveDay] = useState(() => {
    const today = new Date().getDay() || 7;
    return Math.min(6, today - 1);
  });
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const range = weekRange(weekStart);
      const response = await fetch(`/api/slots?from=${range.from}&to=${range.to}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("The timetable could not be loaded.");
      const data = (await response.json()) as { slots: PublicSlot[] };
      setSlots(data.slots);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Please try again.");
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

  const isCurrentWeek = dateKey(weekStart) === dateKey(currentWeek);

  return (
    <main className="public-page">
      <section className="public-booking-shell">
        <header className="booking-titlebar">
          <Link href="/">Arsenios&apos; Booking Page</Link>
        </header>

        <section className="calendar-card" aria-label="Weekly lesson availability">
          <div className="week-toolbar">
          <button
            className="icon-button"
            onClick={() => changeWeek(-1)}
            disabled={isCurrentWeek}
            aria-label="Previous week"
          >
            ←
          </button>
          <div>
            <span className="toolbar-kicker">Week of</span>
            <strong>{formatWeek(weekStart)}</strong>
          </div>
          <button className="icon-button" onClick={() => changeWeek(1)} aria-label="Next week">
            →
          </button>
          </div>

          <div className="mobile-day-tabs" aria-label="Choose a day">
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

          {error ? (
            <div className="empty-state error-state">
              <p>{error}</p>
              <button className="secondary-button" onClick={() => void loadSlots()}>Try again</button>
            </div>
          ) : (
            <div
              className={`week-calendar ${loading ? "is-loading" : ""}`}
              onTouchStart={(event) => {
                const touch = event.touches[0];
                touchStart.current = { x: touch.clientX, y: touch.clientY };
              }}
              onTouchEnd={handleTouchEnd}
            >
            <div className="calendar-header-row">
              <div className="time-heading">Time</div>
              {days.map((day, index) => (
                <div
                  className={`day-heading ${index === activeDay ? "mobile-active" : ""}`}
                  key={dateKey(day)}
                >
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
                    className={`day-column ${index === activeDay ? "mobile-active" : ""}`}
                    style={{ height: timeRows.length * ROW_HEIGHT }}
                    key={key}
                  >
                    <div className="grid-lines" aria-hidden="true" />
                    {daySlots.map((slot) => {
                      const row = (minutesInTeacherZone(slot.startAt) - timeRows[0]) / 30;
                      if (row < 0 || row >= timeRows.length) return null;
                      return (
                        <Link
                          className="available-slot"
                          href={`/book?slot=${encodeURIComponent(slot.id)}`}
                          key={slot.id}
                          style={{ top: row * ROW_HEIGHT + 3, height: ROW_HEIGHT * 2 - 6 }}
                          aria-label={`Book ${formatDay(day)} at ${formatTime(slot.startAt)}`}
                        >
                          <span>{formatTime(slot.startAt)}</span>
                          <strong>Available</strong>
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            </div>
          )}

          <div className="calendar-legend">
            <span><i className="legend-swatch available" />Available</span>
            <span><i className="legend-swatch unavailable" />Unavailable</span>
            <span className="swipe-hint">Swipe to change day</span>
            <Link className="admin-entry-link" href="/admin/login">Admin</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
