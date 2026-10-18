import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the public booking calendar and finished metadata", async () => {
  const [calendar, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/BookingCalendar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /Arsenios' Booking Page/);
  assert.match(calendar, /Arsenios&(?:apos|#39); Booking Page/);
  assert.doesNotMatch(calendar, /Private drum lessons|Choose an available one-hour lesson|Athens time/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/i);
});

test("keeps private names out of the public timetable code path", async () => {
  const [publicRoute, adminRoute, bookingRoute] = await Promise.all([
    readFile(new URL("../app/api/slots/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/slots/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(publicRoute, /studentName:\s*bookingSlots\.studentName/);
  assert.doesNotMatch(publicRoute, /studentEmail:\s*bookingSlots\.studentEmail/);
  assert.match(publicRoute, /slot\.status === "available" \? "available" : "taken"/);
  assert.match(adminRoute, /studentName/);
  assert.match(bookingRoute, /eq\(bookingSlots\.status, "available"\)/);
});

test("adds live calendar context without exposing booking details", async () => {
  const [calendar, styles, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/BookingCalendar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(calendar, /Taken/);
  assert.match(calendar, /available this week/);
  assert.match(calendar, /returnToToday/);
  assert.match(calendar, /visibilitychange/);
  assert.match(calendar, /availability-list/);
  assert.match(calendar, /Updated just now/);
  assert.match(calendar, /useState<"calendar" \| "list">\("list"\)/);
  assert.match(calendar, /arsenios-booking-view-v2/);
  assert.match(styles, /current-time-line/);
  assert.match(styles, /availability-viewbar/);
  assert.match(styles, /feTurbulence/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /serviceWorker|fetch/);
});

test("collects private booking email and sends the requested notifications", async () => {
  const [form, bookingRoute, adminBookingRoute, emailService, schema] = await Promise.all([
    readFile(new URL("../app/book/BookingForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/booking-email.ts", import.meta.url), "utf8"),
    readFile(new URL("../schema.sql", import.meta.url), "utf8"),
  ]);

  assert.match(form, /type="email"/);
  assert.match(bookingRoute, /studentEmail: email/);
  assert.match(adminBookingRoute, /sendBookingEmail/);
  assert.match(emailService, /Your drum lesson is confirmed/);
  assert.match(emailService, /has been rejected/);
  assert.match(emailService, /\+30 694 263 1232/);
  assert.match(emailService, /api\.brevo\.com\/v3\/smtp\/email/);
  assert.match(schema, /student_email TEXT/);
});

test("uses website-native admin authentication and Cloudflare configuration", async () => {
  const [adminPage, adminDashboard, auth, wrangler, publicCalendar] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../app/BookingCalendar.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(adminPage, /admin\/login/);
  assert.match(adminDashboard, /Edit availability/);
  assert.match(adminDashboard, /Approve request/);
  assert.match(adminDashboard, /Reject/);
  assert.match(adminDashboard, /calendarScroll/);
  assert.match(adminDashboard, /Copy last week/);
  assert.match(adminDashboard, /nav-badge/);
  assert.match(adminDashboard, /admin-overview-editing/);
  assert.match(adminDashboard, /admin-calendar-readonly/);
  assert.doesNotMatch(adminDashboard, /Your final teaching schedule for this week|Needs attention|At a glance/i);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Strict/);
  assert.match(auth, /ADMIN_PASSWORD/);
  assert.match(wrangler, /"binding": "DB"/);
  assert.match(publicCalendar, /href="\/admin\/login"/);
  assert.doesNotMatch(adminPage, /ChatGPT/i);
});

test("copies lesson times without copying student bookings", async () => {
  const [dashboard, slotsRoute, styles] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/slots/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /copy_previous_week/);
  assert.match(dashboard, /Student names and bookings will not be copied/);
  assert.match(dashboard, /copy-week-button.*isEditing.*is-editing/s);
  assert.match(styles, /\.copy-week-button:not\(\.is-editing\)\s*\{\s*display:\s*none;/s);
  assert.match(slotsRoute, /teacherCalendarDate/);
  assert.match(slotsRoute, /pendingCount/);
  assert.match(slotsRoute, /status: "available"/);
});

test("tracks completed lessons without deleting cleared history", async () => {
  const [dashboard, completedPage, completedRoute, schema, migration] = await Promise.all([
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/completed/CompletedLessons.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/completed/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../completion-migration.sql", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /Pending requests/);
  assert.match(dashboard, /Confirmed this week/);
  assert.match(dashboard, /Mark completed/);
  assert.match(completedPage, /Show cleared history/);
  assert.match(completedPage, /Clear from list/);
  assert.match(completedRoute, /clearedAt: now/);
  assert.doesNotMatch(completedRoute, /delete\(bookingSlots\)/);
  assert.match(schema, /completedAt/);
  assert.match(schema, /clearedAt/);
  assert.match(migration, /ADD COLUMN completed_at/);
  assert.match(migration, /ADD COLUMN cleared_at/);
});

test("adds a private searchable student directory from existing lesson history", async () => {
  const [page, directory, route, dashboard, completedPage] = await Promise.all([
    readFile(new URL("../app/admin/students/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/students/StudentsDirectory.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/students/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/completed/CompletedLessons.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /hasAdminSession/);
  assert.match(page, /redirect\("\/admin\/login"\)/);
  assert.match(directory, /normalize\("NFD"\)/);
  assert.match(directory, /toLocaleLowerCase\("el-GR"\)/);
  assert.match(directory, /Search by name or email/);
  assert.match(directory, /Lesson history/);
  assert.match(directory, /Pending approval/);
  assert.match(directory, /Completed · Active list/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /studentEmail.*trim/s);
  assert.match(route, /latestBookingAt/);
  assert.match(route, /status:\s*"pending" \| "scheduled" \| "completed"/);
  assert.match(route, /clearedAt/);
  assert.match(dashboard, /href="\/admin\/students"/);
  assert.match(completedPage, /href="\/admin\/students"/);
});
