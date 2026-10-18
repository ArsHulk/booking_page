import { and, eq, gt, lt, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots } from "../../../../db/schema";
import {
  errorResponse,
  getSlotsInRange,
  parseRange,
} from "../../../../lib/server";
import { requireAdmin } from "../../../../lib/admin-auth";
import {
  addDays,
  dateKey,
  minutesInTeacherZone,
  teacherCalendarDate,
  timestampFor,
  weekRange,
} from "../../../../lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { from, to } = parseRange(new URL(request.url));
    const db = getDb();
    const [rangeSlots, allPending] = await Promise.all([
      getSlotsInRange(from, to),
      db
        .select({ id: bookingSlots.id })
        .from(bookingSlots)
        .where(eq(bookingSlots.status, "pending")),
    ]);
    const slots = rangeSlots.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt.getTime(),
      endAt: slot.endAt.getTime(),
      status: slot.status,
      studentName: slot.studentName,
      studentEmail: slot.studentEmail,
      completedAt: slot.completedAt?.getTime() ?? null,
      clearedAt: slot.clearedAt?.getTime() ?? null,
    }));
    return Response.json({ slots, pendingCount: allPending.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const payload = (await request.json()) as {
      startAt?: number;
      action?: "copy_previous_week";
      weekStart?: string;
    };

    if (payload.action === "copy_previous_week") {
      const weekStartKey = payload.weekStart?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartKey)) {
        return Response.json({ error: "Invalid destination week" }, { status: 400 });
      }

      const [year, month, day] = weekStartKey.split("-").map(Number);
      const targetWeek = new Date(Date.UTC(year, month - 1, day, 12));
      if (dateKey(targetWeek) !== weekStartKey || targetWeek.getUTCDay() !== 1) {
        return Response.json({ error: "The destination must begin on a Monday" }, { status: 400 });
      }

      const now = Date.now();
      const targetRange = weekRange(targetWeek);
      if (
        targetRange.to <= now ||
        targetRange.from > now + 180 * 24 * 60 * 60 * 1000
      ) {
        return Response.json({ error: "Choose a current or future week" }, { status: 400 });
      }

      const sourceWeek = addDays(targetWeek, -7);
      const sourceRange = weekRange(sourceWeek);
      const [sourceSlots, targetSlots] = await Promise.all([
        getSlotsInRange(sourceRange.from, sourceRange.to),
        getSlotsInRange(targetRange.from, targetRange.to),
      ]);
      const sourceLessonTimes = sourceSlots;
      const occupied = targetSlots.map((slot) => ({
        startAt: slot.startAt.getTime(),
        endAt: slot.endAt.getTime(),
      }));
      const additions: Array<{
        id: string;
        startAt: Date;
        endAt: Date;
        status: "available";
      }> = [];

      for (const slot of sourceLessonTimes) {
        const sourceDate = teacherCalendarDate(slot.startAt.getTime());
        const targetDate = addDays(sourceDate, 7);
        const copiedStartAt = timestampFor(
          targetDate,
          minutesInTeacherZone(slot.startAt.getTime()),
        );
        const copiedEndAt = copiedStartAt + 60 * 60 * 1000;
        const overlaps = occupied.some(
          (existing) =>
            existing.startAt < copiedEndAt && existing.endAt > copiedStartAt,
        );
        if (
          copiedStartAt <= now ||
          copiedStartAt < targetRange.from ||
          copiedStartAt >= targetRange.to ||
          overlaps
        ) {
          continue;
        }

        additions.push({
          id: crypto.randomUUID(),
          startAt: new Date(copiedStartAt),
          endAt: new Date(copiedEndAt),
          status: "available",
        });
        occupied.push({ startAt: copiedStartAt, endAt: copiedEndAt });
      }

      if (additions.length) {
        await getDb().insert(bookingSlots).values(additions);
      }

      return Response.json({
        copied: additions.length,
        skipped: sourceLessonTimes.length - additions.length,
      });
    }

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
        completedAt: null,
        clearedAt: null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
