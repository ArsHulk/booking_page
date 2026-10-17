import { and, eq, gt, lt, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots } from "../../../../db/schema";
import {
  errorResponse,
  getSlotsInRange,
  parseRange,
} from "../../../../lib/server";
import { requireAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { from, to } = parseRange(new URL(request.url));
    const slots = (await getSlotsInRange(from, to)).map((slot) => ({
      id: slot.id,
      startAt: slot.startAt.getTime(),
      endAt: slot.endAt.getTime(),
      status: slot.status,
      studentName: slot.studentName,
      studentEmail: slot.studentEmail,
    }));
    return Response.json({ slots });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const payload = (await request.json()) as { startAt?: number };
    const startAt = Number(payload.startAt);
    const now = Date.now();

    if (
      !Number.isFinite(startAt) ||
      startAt < now - 24 * 60 * 60 * 1000 ||
      startAt > now + 180 * 24 * 60 * 60 * 1000 ||
      startAt % (30 * 60 * 1000) !== 0
    ) {
      return Response.json({ error: "Invalid lesson time" }, { status: 400 });
    }

    const start = new Date(startAt);
    const end = new Date(startAt + 60 * 60 * 1000);
    const db = getDb();
    const overlapping = await db
      .select()
      .from(bookingSlots)
      .where(
        or(
          and(lt(bookingSlots.startAt, end), gt(bookingSlots.endAt, start)),
          eq(bookingSlots.startAt, start),
        ),
      )
      .limit(1);

    const existing = overlapping[0];
    if (existing?.startAt.getTime() === startAt && existing.status === "available") {
      await db.delete(bookingSlots).where(eq(bookingSlots.id, existing.id));
      return Response.json({ removed: existing.id });
    }

    if (existing) {
      return Response.json(
        { error: "This lesson would overlap another available or booked time." },
        { status: 409 },
      );
    }

    const [slot] = await db
      .insert(bookingSlots)
      .values({
        id: crypto.randomUUID(),
        startAt: start,
        endAt: end,
        status: "available",
      })
      .returning();

    return Response.json({
      slot: {
        id: slot.id,
        startAt: slot.startAt.getTime(),
        endAt: slot.endAt.getTime(),
        status: slot.status,
        studentName: null,
        studentEmail: null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
