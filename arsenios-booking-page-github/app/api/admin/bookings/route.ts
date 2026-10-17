import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots } from "../../../../db/schema";
import { requireAdmin } from "../../../../lib/admin-auth";
import { BookingEmailKind, sendBookingEmail } from "../../../../lib/booking-email";
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
    const [booking] = await db
      .select()
      .from(bookingSlots)
      .where(eq(bookingSlots.id, slotId))
      .limit(1);

    if (!booking) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }

    const expectedStatus = payload.action === "approve" ? "pending" : booking.status;
    if (
      (payload.action === "approve" && booking.status !== "pending") ||
      (payload.action === "release" && !["pending", "confirmed"].includes(booking.status))
    ) {
      return Response.json({ error: "That booking has already changed" }, { status: 409 });
    }

    let emailWarning: string | undefined;
    if (booking.studentName && booking.studentEmail) {
      const kind: BookingEmailKind = payload.action === "approve"
        ? "confirmed"
        : booking.status === "confirmed"
          ? "cancelled"
          : "rejected";
      try {
        await sendBookingEmail({
          id: booking.id,
          version: booking.updatedAt.getTime(),
          kind,
          studentName: booking.studentName,
          studentEmail: booking.studentEmail,
          startAt: booking.startAt,
        });
      } catch (emailError) {
        console.error(emailError);
        return Response.json(
          {
            error: "The booking was not changed because the email could not be sent. Check the Brevo settings and try again.",
          },
          { status: 502 },
        );
      }
    } else {
      emailWarning = "This older booking has no email address, so its status changed without sending an email.";
    }

    if (payload.action === "approve") {
      const [updated] = await db
        .update(bookingSlots)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(
          and(eq(bookingSlots.id, slotId), eq(bookingSlots.status, expectedStatus)),
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
          studentEmail: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(bookingSlots.id, slotId), eq(bookingSlots.status, expectedStatus)),
        )
        .returning({ id: bookingSlots.id });
      if (!updated) {
        return Response.json({ error: "Booking not found" }, { status: 404 });
      }
    }

    return Response.json({ ok: true, emailSent: !emailWarning, emailWarning });
  } catch (error) {
    return errorResponse(error);
  }
}
