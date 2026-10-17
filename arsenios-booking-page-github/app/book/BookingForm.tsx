"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { formatLongSlot, PublicSlot } from "../../lib/calendar";

export function BookingForm({ slotId }: { slotId: string }) {
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

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
            <p className="eyebrow">Request received</p>
            <h1>That time is being held for you.</h1>
            <p>{formatLongSlot(slot.startAt, slot.endAt)}</p>
            <p className="muted-copy">You will receive an email when Arsenios approves or rejects your request.</p>
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
              <strong>{formatLongSlot(slot.startAt, slot.endAt)}</strong>
            </div>
            <form onSubmit={submitRequest}>
              <label htmlFor="student-name">Your name</label>
              <input
                id="student-name"
                name="name"
                autoComplete="name"
                autoFocus
                minLength={2}
                maxLength={80}
                placeholder="Enter your full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <p className="form-help">Your name will only be visible to Arsenios.</p>
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
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <button className="primary-button full-width" disabled={submitting}>
                {submitting ? "Sending request…" : "Submit request"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
