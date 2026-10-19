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
import { HomeScreenButton } from "./HomeScreenButton";

const ROW_HEIGHT = 40;
const REFRESH_INTERVAL = 45_000;

function updatedLabel(updatedAt: number | null, now: number) {
  if (!updatedAt) return "Updating…";
  const elapsedMinutes = Math.floor((now - updatedAt) / 60_000);
  if (elapsedMinutes < 1) return "Updated just now";
  if (elapsedMinutes === 1) return "Updated 1 min ago";
  return `Updated ${elapsedMinutes} mins ago`;
}

export function BookingCalendar() {
  const [now, setNow] = useState(() => Date.now());
  const currentWeek = useMemo(() => startOfWeek(new Date(now)), [now]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [activeDay, setActiveDay] = useState(() => Math.max(0, (new Date().getDay() || 7) - 1));
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("list");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const loadSlots = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const range = weekRange(weekStart);
      const response = await fetch(`/api/slots?from=${range.from}&to=${range.to}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("The timetable could not be loaded.");
      const data = (await response.json()) as { slots: PublicSlot[] };
      setSlots(data.slots);
      setLastUpdated(Date.now());
      setError("");
    } catch (loadError) {
      if (showLoading) setError(loadError instanceof Error ? loadError.message : "Please try again.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    void loadSlots(true);
  }, [loadSlots]);

  useEffect(() => {
    const savedView = window.localStorage.getItem("arsenios-booking-view-v2");
    if (savedView === "calendar" || savedView === "list") {
      setViewMode(savedView);
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      const refreshedAt = Date.now();
      const refreshedWeek = startOfWeek(new Date(refreshedAt));
      setNow(refreshedAt);
      if (dateKey(weekStart) < dateKey(refreshedWeek)) {
        setWeekStart(refreshedWeek);
        setActiveDay(Math.max(0, (new Date(refreshedAt).getDay() || 7) - 1));
      }
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
  }, [loadSlots, weekStart]);

  function changeWeek(amount: number) {
    setWeekStart((current) => addDays(current, amount * 7));
    setActiveDay(0);
    setLastUpdated(null);
  }

  function returnToToday() {
    const today = new Date();
    setNow(today.getTime());
    setWeekStart(startOfWeek(today));
    setActiveDay(Math.max(0, (today.getDay() || 7) - 1));
    setLastUpdated(null);
  }

  function chooseView(view: "calendar" | "list") {
    setViewMode(view);
    window.localStorage.setItem("arsenios-booking-view-v2", view);
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
  const todayKey = slotDateKey(now);
  const availableSlots = slots.filter((slot) => slot.status === "available");
  const activeDayKey = dateKey(days[activeDay]);
  const activeDayAvailable = availableSlots.filter((slot) => slotDateKey(slot.startAt) === activeDayKey).length;
  const listGroups = days
    .map((day) => ({
      day,
      slots: availableSlots
        .filter((slot) => slotDateKey(slot.startAt) === dateKey(day))
        .sort((first, second) => first.startAt - second.startAt),
    }))
    .filter((group) => group.slots.length > 0);
  const currentMinutes = minutesInTeacherZone(now);
  const currentLineTop = (currentMinutes - timeRows[0]) / 30 * ROW_HEIGHT;
  const showCurrentTime = currentMinutes >= timeRows[0] && currentMinutes < timeRows[timeRows.length - 1] + 30;

  return (
    <main className="public-page">
      <section className="public-booking-shell">
        <header className="booking-titlebar">
          <Link href="/">Arsenios&apos; Booking Page</Link>
          <HomeScreenButton />
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
              <span className="availability-count desktop-count">
                {availableSlots.length} {availableSlots.length === 1 ? "lesson" : "lessons"} available this week
              </span>
              <span className="availability-count mobile-count">
                {viewMode === "calendar"
                  ? `${activeDayAvailable} ${activeDayAvailable === 1 ? "lesson" : "lessons"} available ${formatDay(days[activeDay], false)}`
                  : `${availableSlots.length} ${availableSlots.length === 1 ? "lesson" : "lessons"} available this week`}
              </span>
            </div>
            <button className="icon-button" onClick={() => changeWeek(1)} aria-label="Next week">→</button>
            <button
              className="return-today-button"
              onClick={returnToToday}
              disabled={isCurrentWeek && activeDayKey === todayKey}
              type="button"
            >
              Today
            </button>
          </div>

          <div className="availability-viewbar">
            <div className="view-toggle" role="tablist" aria-label="Availability view">
              <button
                className={viewMode === "calendar" ? "active" : ""}
                onClick={() => chooseView("calendar")}
                role="tab"
                aria-selected={viewMode === "calendar"}
                aria-controls="availability-calendar"
              >
                Calendar
              </button>
              <button
                className={viewMode === "list" ? "active" : ""}
                onClick={() => chooseView("list")}
                role="tab"
                aria-selected={viewMode === "list"}
                aria-controls="availability-list"
              >
                List
              </button>
            </div>
            <span className="refresh-status" aria-live="polite">{updatedLabel(lastUpdated, now)}</span>
          </div>

          {viewMode === "calendar" ? (
            <div className="mobile-day-tabs" aria-label="Choose a day">
              {days.map((day, index) => (
                <button
                  key={dateKey(day)}
                  className={`${index === activeDay ? "active" : ""} ${dateKey(day) === todayKey ? "is-today" : ""}`}
                  onClick={() => setActiveDay(index)}
                >
                  <span>{formatDay(day, false)}</span>
                  <strong>{day.getDate()}</strong>
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="empty-state error-state">
              <p>{error}</p>
              <button className="secondary-button" onClick={() => void loadSlots(true)}>Try again</button>
            </div>
          ) : loading && !lastUpdated ? (
            <div className="compact-empty-state">Loading availability…</div>
          ) : slots.length === 0 ? (
            <div className="compact-empty-state no-availability-state">
              Arsenios has not added any availability for this week.
            </div>
          ) : (
            viewMode === "calendar" ? (
              <div
                id="availability-calendar"
                className={`week-calendar ${loading ? "is-loading" : ""}`}
                role="tabpanel"
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
                      className={`day-heading ${index === activeDay ? "mobile-active" : ""} ${dateKey(day) === todayKey ? "is-today" : ""}`}
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
                    const isToday = key === todayKey;
                    const daySlots = slots.filter((slot) => slotDateKey(slot.startAt) === key);
                    return (
                      <div
                        className={`day-column ${index === activeDay ? "mobile-active" : ""} ${isToday ? "is-today" : ""}`}
                        style={{ height: timeRows.length * ROW_HEIGHT }}
                        key={key}
                      >
                        <div className="grid-lines" aria-hidden="true" />
                        {isToday && showCurrentTime ? (
                          <div className="current-time-line" style={{ top: currentLineTop }} aria-label={`Current time ${formatTime(now)}`}>
                            <span>{formatTime(now)}</span>
                          </div>
                        ) : null}
                        {daySlots.map((slot) => {
                          const row = (minutesInTeacherZone(slot.startAt) - timeRows[0]) / 30;
                          if (row < 0 || row >= timeRows.length) return null;
                          const style = { top: row * ROW_HEIGHT + 3, height: ROW_HEIGHT * 2 - 6 };
                          return slot.status === "available" ? (
                            <Link
                              className="available-slot"
                              href={`/book?slot=${encodeURIComponent(slot.id)}`}
                              key={slot.id}
                              style={style}
                              aria-label={`Book ${formatDay(day)} at ${formatTime(slot.startAt)}`}
                            >
                              <span>{formatTime(slot.startAt)}</span>
                              <strong>Available</strong>
                            </Link>
                          ) : (
                            <div className="taken-slot" key={slot.id} style={style} aria-label={`Taken at ${formatTime(slot.startAt)}`}>
                              <span>{formatTime(slot.startAt)}</span>
                              <strong>Taken</strong>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div id="availability-list" className={`availability-list ${loading ? "is-loading" : ""}`} role="tabpanel">
                {listGroups.length ? (
                  listGroups.map((group) => (
                    <section className={`availability-day-group ${dateKey(group.day) === todayKey ? "is-today" : ""}`} key={dateKey(group.day)}>
                      <div className="availability-day-label">
                        <strong>{formatDay(group.day, false)}</strong>
                        <span>{group.day.getDate()}</span>
                      </div>
                      <div className="availability-time-list">
                        {group.slots.map((slot) => (
                          <Link
                            className="availability-list-slot"
                            href={`/book?slot=${encodeURIComponent(slot.id)}`}
                            key={slot.id}
                            aria-label={`Book ${formatDay(group.day)} at ${formatTime(slot.startAt)}`}
                          >
                            <strong>{formatTime(slot.startAt)}</strong>
                            <span>Book</span>
                          </Link>
                        ))}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="compact-empty-state">No available lessons this week.</div>
                )}
              </div>
            )
          )}

          <div className="calendar-legend">
            <span><i className="legend-swatch available" />Available</span>
            {viewMode === "calendar" ? <span><i className="legend-swatch taken" />Taken</span> : null}
            {viewMode === "calendar" ? <span><i className="legend-swatch unavailable" />Unavailable</span> : null}
            {viewMode === "calendar" ? <span className="swipe-hint">Swipe to change day</span> : null}
            <Link className="admin-entry-link" href="/admin/login">Admin</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
