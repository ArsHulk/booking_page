import { and, gte, lt } from "drizzle-orm";
import { getDb } from "../db";
import { bookingSlots } from "../db/schema";

export type SlotStatus = "available" | "pending" | "confirmed";

export function parseRange(url: URL) {
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Response("Invalid date range", { status: 400 });
  }

  if (to - from > 9 * 24 * 60 * 60 * 1000) {
    throw new Response("Date range is too large", { status: 400 });
  }

  return { from: new Date(from), to: new Date(to) };
}

export async function getSlotsInRange(from: Date, to: Date) {
  return getDb()
    .select()
    .from(bookingSlots)
    .where(and(gte(bookingSlots.startAt, from), lt(bookingSlots.startAt, to)))
    .orderBy(bookingSlots.startAt);
}

export function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  console.error(error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
