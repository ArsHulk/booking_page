import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots } from "../../../../db/schema";
import { requireAdmin } from "../../../../lib/admin-auth";
import { errorResponse } from "../../../../lib/server";

export const dynamic = "force-dynamic";

type StudentLesson = {
  id: string;
  startAt: number;
  endAt: number;
  status: "pending" | "scheduled" | "completed";
  completedAt: number | null;
  clearedAt: number | null;
};

type StudentRecord = {
  key: string;
  name: string;
  email: string;
  lessons: StudentLesson[];
  completedCount: number;
  upcomingCount: number;
  pendingCount: number;
  latestBookingAt: number;
};

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const db = getDb();
    const [bookings, allPending] = await Promise.all([
      db
        .select({
          id: bookingSlots.id,
          startAt: bookingSlots.startAt,
          endAt: bookingSlots.endAt,
          status: bookingSlots.status,
          studentName: bookingSlots.studentName,
          studentEmail: bookingSlots.studentEmail,
          completedAt: bookingSlots.completedAt,
          clearedAt: bookingSlots.clearedAt,
        })
        .from(bookingSlots)
        .where(isNotNull(bookingSlots.studentEmail))
        .orderBy(desc(bookingSlots.startAt)),
      db
        .select({ id: bookingSlots.id })
        .from(bookingSlots)
        .where(eq(bookingSlots.status, "pending")),
    ]);

    const now = Date.now();
    const grouped = new Map<string, StudentRecord>();

    for (const booking of bookings) {
      const email = booking.studentEmail?.trim() ?? "";
      if (!email) continue;
      const key = email.toLocaleLowerCase("en");
      const startAt = booking.startAt.getTime();
      const existing = grouped.get(key);
      const student = existing ?? {
        key,
        name: booking.studentName?.trim() || "Student",
        email,
        lessons: [],
        completedCount: 0,
        upcomingCount: 0,
        pendingCount: 0,
        latestBookingAt: startAt,
      };

      if (
        booking.studentName?.trim() &&
        (!existing || startAt >= student.latestBookingAt)
      ) {
        student.name = booking.studentName.trim();
      }
      student.latestBookingAt = Math.max(student.latestBookingAt, startAt);

      if (booking.status === "pending") student.pendingCount += 1;
      if (booking.status === "confirmed" && !booking.completedAt && startAt >= now) {
        student.upcomingCount += 1;
      }
      if (booking.status === "confirmed" && booking.completedAt) {
        student.completedCount += 1;
      }

      student.lessons.push({
        id: booking.id,
        startAt,
        endAt: booking.endAt.getTime(),
        status:
          booking.status === "pending"
            ? "pending"
            : booking.completedAt
              ? "completed"
              : "scheduled",
        completedAt: booking.completedAt?.getTime() ?? null,
        clearedAt: booking.clearedAt?.getTime() ?? null,
      });

      grouped.set(key, student);
    }

    const students = Array.from(grouped.values())
      .map((student) => ({
          key: student.key,
          name: student.name,
          email: student.email,
          lessons: student.lessons.sort(
            (first, second) => second.startAt - first.startAt,
          ),
          completedCount: student.completedCount,
          upcomingCount: student.upcomingCount,
          pendingCount: student.pendingCount,
          latestBookingAt: student.latestBookingAt,
        }))
      .sort((first, second) =>
        first.name.localeCompare(second.name, "en", { sensitivity: "base" }),
      );

    return Response.json({
      students,
      pendingCount: allPending.length,
      completedCount: students.reduce(
        (total, student) => total + student.completedCount,
        0,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
