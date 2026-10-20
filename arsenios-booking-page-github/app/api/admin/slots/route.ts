import { env } from "cloudflare:workers";
import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";
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
  TEACHER_TIME_ZONE,
  timestampFor,
  weekRange,
} from "../../../../lib/calendar";

export const dynamic = "force-dynamic";

const LESSON_DURATION = 60 * 60 * 1000;
const SLOT_STEP = 30 * 60 * 1000;
const MAX_FUTURE = 180 * 24 * 60 * 60 * 1000;

function validFutureStart(startAt: number, now: number) {
  return (
    Number.isFinite(startAt) &&
    startAt >= now &&
    startAt <= now + MAX_FUTURE &&
    startAt % SLOT_STEP === 0
  );
}

function copyTimestampToNextWeek(sourceTimestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEACHER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(sourceTimestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);

  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    throw new Error("The source lesson contains an invalid date or time");
  }

  const sourceDate = new Date(Date.UTC(year, month - 1, day, 12));
  return timestampFor(addDays(sourceDate, 7), hour * 60 + minute);
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { from, to } = parseRange(new URL(request.url));
    const db = getDb();
    const [rangeSlots, allPending, upcomingLessons] = await Promise.all([
      getSlotsInRange(from, to),
      db
        .select()
        .from(bookingSlots)
        .where(eq(bookingSlots.status, "pending"))
        .orderBy(asc(bookingSlots.startAt)),
      db
        .select()
        .from(bookingSlots)
        .where(
          and(
            eq(bookingSlots.status, "confirmed"),
            gt(bookingSlots.startAt, new Date()),
            isNull(bookingSlots.completedAt),
          ),
        )
        .orderBy(asc(bookingSlots.startAt))
        .limit(1),
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
    const next = upcomingLessons[0];
    const pendingRequests = allPending.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt.getTime(),
      endAt: slot.endAt.getTime(),
      status: slot.status,
      studentName: slot.studentName,
      studentEmail: slot.studentEmail,
      completedAt: slot.completedAt?.getTime() ?? null,
      clearedAt: slot.clearedAt?.getTime() ?? null,
    }));
    const nextLesson = next
      ? {
          id: next.id,
          startAt: next.startAt.getTime(),
          endAt: next.endAt.getTime(),
          status: next.status,
          studentName: next.studentName,
          studentEmail: next.studentEmail,
          completedAt: next.completedAt?.getTime() ?? null,
          clearedAt: next.clearedAt?.getTime() ?? null,
        }
      : null;
    return Response.json({
      slots,
      pendingRequests,
      pendingCount: pendingRequests.length,
      nextLesson,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const payload = (await request.json()) as {
      startAt?: number;
      startAts?: number[];
      action?:
        | "copy_previous_week"
        | "undo_copy_previous_week"
        | "remove_availability"
        | "add_availability_range"
        | "move_availability";
      weekStart?: string;
      slotIds?: string[];
      slotId?: string;
      targetStartAt?: number;
      copy?: boolean;
    };

    if (payload.action === "add_availability_range") {
      const now = Date.now();
      const startAts = Array.isArray(payload.startAts)
        ? [...new Set(payload.startAts.map(Number))].sort((first, second) => first - second)
        : [];

      if (
        !startAts.length ||
        startAts.length > 128 ||
        startAts.some((startAt) => !validFutureStart(startAt, now))
      ) {
        return Response.json({ error: "Choose valid future lesson times." }, { status: 400 });
      }

      const rangeStart = startAts[0];
      const rangeEnd = startAts[startAts.length - 1] + LESSON_DURATION;
      type OccupiedRow = { start_at: number; end_at: number };
      const occupiedResult = await env.DB.prepare(
        `SELECT start_at, end_at
         FROM booking_slots
         WHERE start_at < ?2 AND end_at > ?1
         ORDER BY start_at`,
      )
        .bind(rangeStart, rangeEnd)
        .all<OccupiedRow>();
      const occupied = occupiedResult.results.map((slot) => ({
        startAt: Number(slot.start_at),
        endAt: Number(slot.end_at),
      }));
      const additions: Array<{ id: string; startAt: number; endAt: number }> = [];

      for (const startAt of startAts) {
        const endAt = startAt + LESSON_DURATION;
        const overlaps = occupied.some(
          (slot) => slot.startAt < endAt && slot.endAt > startAt,
        );
        if (overlaps) continue;
        const addition = { id: crypto.randomUUID(), startAt, endAt };
        additions.push(addition);
        occupied.push({ startAt, endAt });
      }

      if (additions.length) {
        const savedAt = Date.now();
        await env.DB.batch(
          additions.map((slot) =>
            env.DB.prepare(
              `INSERT INTO booking_slots
                (id, start_at, end_at, status, created_at, updated_at)
               VALUES (?1, ?2, ?3, 'available', ?4, ?4)`,
            ).bind(slot.id, slot.startAt, slot.endAt, savedAt),
          ),
        );
      }

      return Response.json({
        added: additions.length,
        skipped: startAts.length - additions.length,
        addedSlotIds: additions.map((slot) => slot.id),
      });
    }

    if (payload.action === "move_availability") {
      const slotId = payload.slotId?.trim() ?? "";
      const targetStartAt = Number(payload.targetStartAt);
      const copy = payload.copy === true;
      const now = Date.now();

      if (
        !slotId ||
        slotId.length > 80 ||
        !validFutureStart(targetStartAt, now)
      ) {
        return Response.json({ error: "Choose a valid destination." }, { status: 400 });
      }

      type AvailableRow = { id: string; start_at: number; status: string };
      const source = await env.DB.prepare(
        `SELECT id, start_at, status
         FROM booking_slots
         WHERE id = ?1
         LIMIT 1`,
      )
        .bind(slotId)
        .first<AvailableRow>();

      if (!source || source.status !== "available") {
        return Response.json(
          { error: "That availability can no longer be moved." },
          { status: 409 },
        );
      }

      const sourceStartAt = Number(source.start_at);
      if (!copy && sourceStartAt === targetStartAt) {
        return Response.json({ unchanged: true, slotId, sourceStartAt });
      }

      const targetEndAt = targetStartAt + LESSON_DURATION;
      const overlapQuery = copy
        ? `SELECT id FROM booking_slots
           WHERE start_at < ?2 AND end_at > ?1
           LIMIT 1`
        : `SELECT id FROM booking_slots
           WHERE id <> ?3 AND start_at < ?2 AND end_at > ?1
           LIMIT 1`;
      const overlapStatement = env.DB.prepare(overlapQuery);
      const overlap = copy
        ? await overlapStatement.bind(targetStartAt, targetEndAt).first<{ id: string }>()
        : await overlapStatement.bind(targetStartAt, targetEndAt, slotId).first<{ id: string }>();

      if (overlap) {
        return Response.json(
          { error: "That destination overlaps another available or booked lesson." },
          { status: 409 },
        );
      }

      const changedAt = Date.now();
      if (copy) {
        const createdSlotId = crypto.randomUUID();
        const result = await env.DB.prepare(
          `INSERT INTO booking_slots
            (id, start_at, end_at, status, created_at, updated_at)
           SELECT ?1, ?2, ?3, 'available', ?4, ?4
           WHERE EXISTS (
             SELECT 1 FROM booking_slots WHERE id = ?5 AND status = 'available'
           )
           RETURNING id`,
        )
          .bind(createdSlotId, targetStartAt, targetEndAt, changedAt, slotId)
          .first<{ id: string }>();
        if (!result) {
          return Response.json(
            { error: "That availability changed before it could be copied." },
            { status: 409 },
          );
        }
        return Response.json({
          copied: true,
          createdSlotId,
          sourceStartAt,
          targetStartAt,
        });
      }

      const moved = await env.DB.prepare(
        `UPDATE booking_slots
         SET start_at = ?1, end_at = ?2, updated_at = ?3
         WHERE id = ?4 AND status = 'available'
         RETURNING id`,
      )
        .bind(targetStartAt, targetEndAt, changedAt, slotId)
        .first<{ id: string }>();
      if (!moved) {
        return Response.json(
          { error: "That availability changed before it could be moved." },
          { status: 409 },
        );
      }
      return Response.json({
        moved: true,
        slotId,
        sourceStartAt,
        targetStartAt,
      });
    }

    if (
      payload.action === "undo_copy_previous_week" ||
      payload.action === "remove_availability"
    ) {
      const slotIds = Array.isArray(payload.slotIds)
        ? [...new Set(payload.slotIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 80))]
        : [];

      if (!slotIds.length || slotIds.length > 256) {
        return Response.json({ error: "Choose at least one valid availability slot." }, { status: 400 });
      }

      try {
        const results = await env.DB.batch(
          slotIds.map((id) =>
            env.DB.prepare(
              `DELETE FROM booking_slots
               WHERE id = ?1 AND status = 'available'`,
            ).bind(id),
          ),
        );
        const removed = results.reduce(
          (total, result) => total + Number(result.meta.changes ?? 0),
          0,
        );
        return Response.json({ removed, skipped: slotIds.length - removed });
      } catch (removeError) {
        console.error("Removing availability slots failed", removeError);
        return Response.json(
          { error: "Could not remove the selected availability. Please try again." },
          { status: 500 },
        );
      }
    }

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
      type CopySlotRow = {
        start_at: number;
        end_at: number;
      };

      let sourceLessonTimes: CopySlotRow[];
      let occupied: Array<{ startAt: number; endAt: number }>;
      try {
        const [sourceResult, targetResult] = await Promise.all([
          env.DB.prepare(
            `SELECT start_at, end_at
             FROM booking_slots
             WHERE start_at >= ?1 AND start_at < ?2
             ORDER BY start_at`,
          )
            .bind(sourceRange.from, sourceRange.to)
            .all<CopySlotRow>(),
          env.DB.prepare(
            `SELECT start_at, end_at
             FROM booking_slots
             WHERE start_at >= ?1 AND start_at < ?2
             ORDER BY start_at`,
          )
            .bind(targetRange.from, targetRange.to)
            .all<CopySlotRow>(),
        ]);
        sourceLessonTimes = sourceResult.results;
        occupied = targetResult.results.map((slot) => ({
          startAt: Number(slot.start_at),
          endAt: Number(slot.end_at),
        }));
      } catch (readError) {
        console.error("Copy previous week failed while reading slots", readError);
        return Response.json(
          { error: "Could not read last week's lesson times. Please try again." },
          { status: 500 },
        );
      }

      const additions: Array<{
        id: string;
        startAt: number;
        endAt: number;
      }> = [];

      try {
        for (const slot of sourceLessonTimes) {
          const sourceStartAt = Number(slot.start_at);
          if (!Number.isFinite(sourceStartAt)) {
            throw new Error("A source lesson has an invalid start time");
          }

          const copiedStartAt = copyTimestampToNextWeek(sourceStartAt);
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
            startAt: copiedStartAt,
            endAt: copiedEndAt,
          });
          occupied.push({ startAt: copiedStartAt, endAt: copiedEndAt });
        }
      } catch (prepareError) {
        console.error("Copy previous week failed while preparing slots", prepareError);
        return Response.json(
          { error: "Could not prepare last week's lesson times for copying (copy-v5)." },
          { status: 500 },
        );
      }

      if (additions.length) {
        const savedAt = Date.now();
        const statements = additions.map((slot) =>
          env.DB.prepare(
            `INSERT INTO booking_slots
              (id, start_at, end_at, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'available', ?4, ?4)`,
          ).bind(
            slot.id,
            slot.startAt,
            slot.endAt,
            savedAt,
          ),
        );

        try {
          await env.DB.batch(statements);
        } catch (copyError) {
          console.error("Copy previous week failed while saving slots", copyError);
          return Response.json(
            { error: "Could not save the copied lesson times. Please try again." },
            { status: 500 },
          );
        }
      }

      return Response.json({
        copied: additions.length,
        skipped: sourceLessonTimes.length - additions.length,
        copiedSlotIds: additions.map((slot) => slot.id),
        copyVersion: "native-v5",
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
    const end = new Date(startAt + LESSON_DURATION);
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
