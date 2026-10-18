import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots } from "../../../../db/schema";
import { requireAdmin } from "../../../../lib/admin-auth";
import { errorResponse, getSlotsInRange } from "../../../../lib/server";

export const dynamic = "force-dynamic";

function parseMonthRange(url: URL) {
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  const maximum = 40 * 24 * 60 * 60 * 1000;

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > maximum) {
    throw new Response("Invalid month range", { status: 400 });
  }

  return { from: new Date(from), to: new Date(to) };
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { from, to } = parseMonthRange(new URL(request.url));
    const lessons = (await getSlotsInRange(from, to))
      .filter((slot) => slot.status === "confirmed" && slot.completedAt)
      .map((slot) => ({
        id: slot.id,
        startAt: slot.startAt.getTime(),
        endAt: slot.endAt.getTime(),
        studentName: slot.studentName,
        studentEmail: slot.studentEmail,
        completedAt: slot.completedAt?.getTime() ?? null,
        clearedAt: slot.clearedAt?.getTime() ?? null,
      }));

    return Response.json({ lessons });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const payload = (await request.json()) as {
      slotId?: string;
      action?: "complete" | "uncomplete" | "clear" | "restore";
    };
    const slotId = payload.slotId?.trim() ?? "";
    const action = payload.action;

    if (!slotId || !action || !["complete", "uncomplete", "clear", "restore"].includes(action)) {
      return Response.json({ error: "Invalid completion action" }, { status: 400 });
    }

    const db = getDb();
    const [lesson] = await db
      .select()
      .from(bookingSlots)
      .where(eq(bookingSlots.id, slotId))
      .limit(1);

    if (!lesson || lesson.status !== "confirmed") {
      return Response.json({ error: "Confirmed lesson not found" }, { status: 404 });
    }

    if ((action === "clear" || action === "restore") && !lesson.completedAt) {
      return Response.json({ error: "Only completed lessons can be cleared" }, { status: 409 });
    }

    const now = new Date();
    const changes = action === "complete"
      ? { completedAt: now, clearedAt: null, updatedAt: now }
      : action === "uncomplete"
        ? { completedAt: null, clearedAt: null, updatedAt: now }
        : action === "clear"
          ? { clearedAt: now, updatedAt: now }
          : { clearedAt: null, updatedAt: now };

    const [updated] = await db
      .update(bookingSlots)
      .set(changes)
      .where(and(eq(bookingSlots.id, slotId), eq(bookingSlots.status, "confirmed")))
      .returning({
        id: bookingSlots.id,
        completedAt: bookingSlots.completedAt,
        clearedAt: bookingSlots.clearedAt,
      });

    if (!updated) {
      return Response.json({ error: "Lesson changed before it could be updated" }, { status: 409 });
    }

    return Response.json({
      lesson: {
        id: updated.id,
        completedAt: updated.completedAt?.getTime() ?? null,
        clearedAt: updated.clearedAt?.getTime() ?? null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
