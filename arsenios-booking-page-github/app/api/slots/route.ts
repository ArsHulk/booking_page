import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { bookingSlots } from "../../../db/schema";
import { errorResponse, getSlotsInRange, parseRange } from "../../../lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const [slot] = await getDb()
        .select({
          id: bookingSlots.id,
          startAt: bookingSlots.startAt,
          endAt: bookingSlots.endAt,
        })
        .from(bookingSlots)
        .where(
          and(
            eq(bookingSlots.id, id),
            eq(bookingSlots.status, "available"),
            gt(bookingSlots.startAt, new Date()),
          ),
        )
        .limit(1);

      return slot
        ? Response.json({
            slot: {
              ...slot,
              startAt: slot.startAt.getTime(),
              endAt: slot.endAt.getTime(),
              status: "available" as const,
            },
          })
        : Response.json({ error: "That time is no longer available" }, { status: 404 });
    }

    const { from, to } = parseRange(url);
    const now = Date.now();
    const slots = (await getSlotsInRange(from, to))
      .filter((slot) => slot.status !== "available" || slot.startAt.getTime() > now)
      .map((slot) => ({
        id: slot.id,
        startAt: slot.startAt.getTime(),
        endAt: slot.endAt.getTime(),
        status: slot.status === "available" ? "available" : "taken",
      }));

    return Response.json({ slots });
  } catch (error) {
    return errorResponse(error);
  }
}
