"use client";

import { useEffect, useState } from "react";
import {
  describeTimeDifference,
  formatVisitorSlot,
  minutesAheadOfTeacher,
  timeZoneCity,
  visitorTimeZone,
} from "../lib/calendar";

// Only students whose device clock differs from Athens see these notes.
// Everyone in Greece sees nothing extra. Worked out after the page loads,
// so the server and browser render the same first frame.
function useVisitorZone(timestamp?: number) {
  const [zone, setZone] = useState<{ timeZone: string; minutesAhead: number } | null>(null);
  useEffect(() => {
    const timeZone = visitorTimeZone();
    if (!timeZone) return;
    const minutesAhead = minutesAheadOfTeacher(timeZone, timestamp ?? Date.now());
    if (minutesAhead === 0) return;
    setZone({ timeZone, minutesAhead });
  }, [timestamp]);
  return zone;
}

export function LocalTimeNote() {
  const zone = useVisitorZone();
  if (!zone) return null;
  return (
    <p className="local-time-note" role="note">
      Times are shown in Athens time — you&apos;re {describeTimeDifference(zone.minutesAhead)}.
    </p>
  );
}

export function LocalSlotTime({ startAt }: { startAt: number }) {
  const zone = useVisitorZone(startAt);
  if (!zone) return null;
  return (
    <small className="local-slot-time">
      That&apos;s {formatVisitorSlot(startAt, zone.timeZone)} your time ({timeZoneCity(zone.timeZone)}).
    </small>
  );
}
