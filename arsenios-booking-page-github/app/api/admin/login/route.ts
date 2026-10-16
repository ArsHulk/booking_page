import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminLoginAttempts } from "../../../../db/schema";
import {
  adminFingerprint,
  adminSessionCookie,
  createAdminSession,
  verifyAdminPassword,
} from "../../../../lib/admin-auth";
import { errorResponse } from "../../../../lib/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function POST(request: Request) {
  try {
    const fingerprint = await adminFingerprint(request);
    const db = getDb();
    const now = new Date();
    const [attempt] = await db
      .select()
      .from(adminLoginAttempts)
      .where(eq(adminLoginAttempts.fingerprint, fingerprint))
      .limit(1);

    if (attempt?.lockedUntil && attempt.lockedUntil > now) {
      return Response.json(
        { error: "Too many attempts. Please wait 15 minutes and try again." },
        { status: 429 },
      );
    }

    const payload = (await request.json()) as { password?: string };
    const password = typeof payload.password === "string" ? payload.password : "";
    const isValid = await verifyAdminPassword(password);

    if (!isValid) {
      const insideWindow =
        attempt && now.getTime() - attempt.windowStartedAt.getTime() < WINDOW_MS;
      const failures = insideWindow ? attempt.failures + 1 : 1;
      const lockedUntil =
        failures >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null;

      await db
        .insert(adminLoginAttempts)
        .values({
          fingerprint,
          failures,
          windowStartedAt: insideWindow ? attempt.windowStartedAt : now,
          lockedUntil,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: adminLoginAttempts.fingerprint,
          set: {
            failures,
            windowStartedAt: insideWindow ? attempt.windowStartedAt : now,
            lockedUntil,
            updatedAt: now,
          },
        });

      return Response.json(
        {
          error: lockedUntil
            ? "Too many attempts. Please wait 15 minutes and try again."
            : "Incorrect password.",
        },
        { status: lockedUntil ? 429 : 401 },
      );
    }

    if (attempt) {
      await db
        .delete(adminLoginAttempts)
        .where(eq(adminLoginAttempts.fingerprint, fingerprint));
    }

    const token = await createAdminSession();
    const secure = new URL(request.url).protocol === "https:";
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": adminSessionCookie(token, secure) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
