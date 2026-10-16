import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots } from "../../../../db/schema";
import { requireAdmin } from "../../../../lib/admin-auth";
import { errorResponse } from "../../../../lib/server";

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const payload = (await request.json()) as {
      slotId?: string;
      action?: "approve" | "release";
    };

    const slotId = payload.slotId?.trim() ?? "";
    if (!slotId || !["approve", "release"].includes(payload.action ?? "")) {
      return Response.json({ error: "Invalid booking action" }, { status: 400 });
    }

    const db = getDb();
    if (payload.action === "approve") {
      const [updated] = await db
        .update(bookingSlots)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(
          and(eq(bookingSlots.id, slotId), eq(bookingSlots.status, "pending")),
        )
        .returning({ id: bookingSlots.id });
      if (!updated) {
        return Response.json({ error: "That request is no longer pending" }, { status: 409 });
      }
    } else {
      const [updated] = await db
        .update(bookingSlots)
        .set({
          status: "available",
          studentName: null,
          updatedAt: new Date(),
        })
        .where(eq(bookingSlots.id, slotId))
        .returning({ id: bookingSlots.id });
      if (!updated) {
        return Response.json({ error: "Booking not found" }, { status: 404 });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
