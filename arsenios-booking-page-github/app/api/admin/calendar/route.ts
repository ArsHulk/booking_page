import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots } from "../../../../db/schema";
import {
  errorResponse,
  getSlotsInRange,
  parseRange,
} from "../../../../lib/server";
import { requireAdmin } from "../../../../lib/admin-auth";

function icsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const slotId = url.searchParams.get("slot");
    let slots;

    if (slotId) {
      slots = await getDb()
        .select()
        .from(bookingSlots)
        .where(eq(bookingSlots.id, slotId))
        .limit(1);
    } else {
      const { from, to } = parseRange(url);
      slots = await getSlotsInRange(from, to);
    }

    const confirmed = slots.filter((slot) => slot.status === "confirmed");
    const now = icsDate(new Date());
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Arsenios Booking Page//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...confirmed.flatMap((slot) => [
        "BEGIN:VEVENT",
        `UID:${slot.id}@arsenios-booking`,
        `DTSTAMP:${now}`,
        `DTSTART:${icsDate(slot.startAt)}`,
        `DTEND:${icsDate(slot.endAt)}`,
        `SUMMARY:${icsText(`Drum lesson — ${slot.studentName ?? "Student"}`)}`,
        "DESCRIPTION:Confirmed through Arsenios' Booking Page",
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ];

    return new Response(lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="arsenios-lessons.ics"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
