"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  formatLongDate,
  formatTime,
  formatWeekday,
  PublicSlot,
} from "../../lib/calendar";

// Saved only in this student's own browser so returning students don't retype.
const SAVED_DETAILS_KEY = "arsenios-booking-student-v1";

function readSavedDetails(): { name: string; email: string } | null {
  try {
    const raw = window.localStorage.getItem(SAVED_DETAILS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { name?: unknown; email?: unknown };
    if (typeof saved.name !== "string" || typeof saved.email !== "string") return null;
    return { name: saved.name, email: saved.email };
  } catch {
    return null;
  }
}

function saveDetails(name: string, email: string) {
  try {
    window.localStorage.setItem(SAVED_DETAILS_KEY, JSON.stringify({ name, email }));
  } catch {
    // Private browsing or storage disabled: booking still works without it.
  }
}

function forgetDetails() {
  try {
    window.localStorage.removeItem(SAVED_DETAILS_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function BookingForm({ slotId }: { slotId: string }) {
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [usingSavedDetails, setUsingSavedDetails] = useState(false);

  useEffect(() => {
    const saved = readSavedDetails();
    if (!saved) return;
    setName(saved.name);
    setEmail(saved.email);
    setUsingSavedDetails(true);
  }, []);

  function clearSavedDetails() {
    forgetDetails();
    setName("");
    setEmail("");
    setUsingSavedDetails(false);
  }

  useEffect(() => {
    if (!slotId) {
      setError("No lesson time was selected.");
      setLoading(false);
      return;
    }

    fetch(`/api/slots?id=${encodeURIComponent(slotId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { slot?: PublicSlot; error?: string };
        if (!response.ok || !data.slot) throw new Error(data.error ?? "This time is unavailable.");
        setSlot(data.slot);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "This time is unavailable.");
      })
      .finally(() => setLoading(false));
  }, [slotId]);

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (!slot) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, name, email }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Your request could not be sent.");
      saveDetails(name.trim(), email.trim());
      setComplete(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="form-page">
      <Link className="wordmark form-wordmark" href="/">
        <span className="wordmark-mark">A</span>
        <span>Arsenios&apos; Booking Page</span>
      </Link>

      <section className="request-card">
        {complete && slot ? (
          <div className="confirmation-state">
            <span className="confirmation-mark">✓</span>
            <p className="eyebrow">Request sent</p>
            <h1>Your lesson request has been sent.</h1>
            <div className="confirmation-slot">
              <strong>{formatLongDate(slot.startAt)}</strong>
              <span>{formatTime(slot.startAt)}–{formatTime(slot.endAt)}</span>
            </div>
            <p className="muted-copy">Your request was received. Arsenios will review it shortly and you&apos;ll receive an email once accepted or declined!</p>
            <p className="muted-copy change-note">Need to change or cancel? Please contact Arsenios directly.</p>
            <Link className="primary-button" href="/">Return to timetable</Link>
          </div>
        ) : loading ? (
          <div className="form-loading">Loading your selected lesson…</div>
        ) : !slot ? (
          <div className="confirmation-state">
            <p className="eyebrow">Unavailable</p>
            <h1>This time can no longer be requested.</h1>
            <p className="muted-copy">{error || "Please choose another available lesson."}</p>
            <Link className="primary-button" href="/">Choose another time</Link>
          </div>
        ) : (
          <>
            <Link className="back-link" href="/">← Back to timetable</Link>
            <p className="eyebrow">One-hour drum lesson</p>
            <h1>Request this time</h1>
            <div className="selected-time">
              <span>Selected lesson</span>
              <strong>{formatLongDate(slot.startAt)}</strong>
              <em>{formatTime(slot.startAt)}–{formatTime(slot.endAt)}</em>
            </div>
            <form onSubmit={submitRequest}>
              <label htmlFor="student-name">Your first name</label>
              <input
                id="student-name"
                name="name"
                autoComplete="given-name"
                autoFocus
                minLength={2}
                maxLength={80}
                placeholder="For example, Maria"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <p className="form-help">Your first name will only be visible to Arsenios.</p>
              <label htmlFor="student-email">Your email</label>
              <input
                id="student-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <p className="form-help">We will only use this to send the result of this booking request.</p>
              {usingSavedDetails ? (
                <p className="form-help saved-details-note">
                  Filled in from your last booking on this device.{" "}
                  <button className="text-button" type="button" onClick={clearSavedDetails}>Not you? Clear</button>
                </p>
              ) : null}
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button className="primary-button full-width" disabled={submitting}>
                {submitting ? "Sending request…" : `Request ${formatWeekday(slot.startAt)} at ${formatTime(slot.startAt)}`}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
