import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { bookingSlots, studentNotes } from "../../../../db/schema";
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
  note: string;
};

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const db = getDb();
    const [bookings, allPending, notes] = await Promise.all([
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
      db.select().from(studentNotes),
    ]);

    const now = Date.now();
    const grouped = new Map<string, StudentRecord>();
    const notesByEmail = new Map(
      notes.map((entry) => [entry.studentEmail.toLocaleLowerCase("en"), entry.note]),
    );

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
        note: notesByEmail.get(key) ?? "",
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
          note: student.note,
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

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const payload = (await request.json()) as { email?: string; note?: string };
    const email = payload.email?.trim().toLocaleLowerCase("en") ?? "";
    const note = payload.note?.trim() ?? "";

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Invalid student email." }, { status: 400 });
    }
    if (note.length > 2000) {
      return Response.json(
        { error: "Student notes must be 2,000 characters or fewer." },
        { status: 400 },
      );
    }

    const db = getDb();
    if (note) {
      await db
        .insert(studentNotes)
        .values({ studentEmail: email, note, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: studentNotes.studentEmail,
          set: { note, updatedAt: new Date() },
        });
    } else {
      await db.delete(studentNotes).where(eq(studentNotes.studentEmail, email));
    }

    return Response.json({ ok: true, note });
  } catch (error) {
    return errorResponse(error);
  }
}
