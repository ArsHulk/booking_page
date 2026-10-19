import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { bookingSlots } from "../../../db/schema";
import { sendAdminBookingNotification } from "../../../lib/booking-email";
import { errorResponse } from "../../../lib/server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { slotId?: string; name?: string; email?: string };
    const slotId = payload.slotId?.trim() ?? "";
    const name = payload.name?.trim().replace(/\s+/g, " ") ?? "";
    const email = payload.email?.trim().toLowerCase() ?? "";

    if (!slotId || name.length < 2 || name.length > 80) {
      return Response.json(
        { error: "Please enter your first name before requesting this lesson." },
        { status: 400 },
      );
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return Response.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const [slot] = await getDb()
      .update(bookingSlots)
      .set({
        status: "pending",
        studentName: name,
        studentEmail: email,
        completedAt: null,
        clearedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(bookingSlots.id, slotId), eq(bookingSlots.status, "available")),
      )
      .returning({
        id: bookingSlots.id,
        startAt: bookingSlots.startAt,
        endAt: bookingSlots.endAt,
        updatedAt: bookingSlots.updatedAt,
      });

    if (!slot) {
      return Response.json(
        { error: "Someone else has just requested that time. Please choose another." },
        { status: 409 },
      );
    }

    let adminNotificationSent = true;
    try {
      await sendAdminBookingNotification({
        id: slot.id,
        version: slot.updatedAt.getTime(),
        studentName: name,
        studentEmail: email,
        startAt: slot.startAt,
        adminUrl: new URL("/admin", request.url).toString(),
      });
    } catch (notificationError) {
      adminNotificationSent = false;
      console.error("The booking was saved, but the admin notification could not be sent", notificationError);
    }

    return Response.json({
      booking: {
        id: slot.id,
        startAt: slot.startAt.getTime(),
        endAt: slot.endAt.getTime(),
      },
      adminNotificationSent,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
