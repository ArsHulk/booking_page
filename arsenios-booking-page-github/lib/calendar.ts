export const TEACHER_TIME_ZONE = "Europe/Athens";
export const DAY_START_MINUTES = 8 * 60;
export const DAY_END_MINUTES = 23 * 60;
export const STEP_MINUTES = 30;
export const LESSON_MINUTES = 60;

type CalendarSlot = {
  id: string;
  startAt: number;
  endAt: number;
};

export type PublicSlot = CalendarSlot & {
  status: "available" | "taken";
};

export type AdminSlot = CalendarSlot & {
  status: "available" | "pending" | "confirmed";
  studentName: string | null;
  studentEmail: string | null;
  completedAt: number | null;
  clearedAt: number | null;
};

export const timeRows = Array.from(
  { length: (DAY_END_MINUTES - DAY_START_MINUTES) / STEP_MINUTES },
  (_, index) => DAY_START_MINUTES + index * STEP_MINUTES,
);

// Calendar days in this app are Date objects at local noon whose year/month/day
// are the *Athens* date. "Today" must therefore come from Athens time, never
// from the visitor's own clock, or a student abroad sees the wrong day/week.
export function teacherToday(now: number = Date.now()) {
  const [year, month, day] = slotDateKey(now).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

// Monday = 0 … Sunday = 6, for today's date in Athens.
export function teacherWeekdayIndex(now: number = Date.now()) {
  return (teacherToday(now).getDay() || 7) - 1;
}

export function startOfWeek(date = teacherToday()) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

export function startOfMonth(date = teacherToday()) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(1);
  return result;
}

export function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function weekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function slotDateKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEACHER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function teacherCalendarDate(timestamp: number) {
  const [year, month, day] = slotDateKey(timestamp).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function zoneOffset(timestamp: number, timeZone: string = TEACHER_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  );
  return asUtc - timestamp;
}

export function timestampFor(date: Date, minutes: number) {
  const wanted = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  );
  let result = wanted;
  for (let index = 0; index < 3; index += 1) {
    result = wanted - zoneOffset(result);
  }
  return result;
}

export function weekRange(weekStart: Date) {
  return {
    from: timestampFor(weekStart, 0),
    to: timestampFor(addDays(weekStart, 7), 0),
  };
}

export function monthRange(monthStart: Date) {
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  return {
    from: timestampFor(monthStart, 0),
    to: timestampFor(nextMonth, 0),
  };
}

export function minutesInTeacherZone(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEACHER_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export function formatTime(value: number | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TEACHER_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof value === "number" ? new Date(value) : value);
}

export function formatDay(date: Date, includeDate = true) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    ...(includeDate ? { day: "numeric", month: "short" } : {}),
  }).format(date);
}

export function formatWeekday(value: number | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TEACHER_TIME_ZONE,
    weekday: "long",
  }).format(typeof value === "number" ? new Date(value) : value);
}

export function formatLongDate(value: number | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TEACHER_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(typeof value === "number" ? new Date(value) : value);
}

export function formatLongSlot(startAt: number, endAt: number) {
  return `${formatLongDate(startAt)}, ${formatTime(startAt)}–${formatTime(endAt)}`;
}

export function formatWeek(weekStart: Date) {
  const end = addDays(weekStart, 6);
  const startText = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: weekStart.getMonth() === end.getMonth() ? undefined : "short",
  }).format(weekStart);
  const endText = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(end);
  return `${startText} – ${endText}`;
}

export function formatMonth(monthStart: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(monthStart);
}

// ---- Visitor's own time zone (shown only to students outside Athens time) ----

export function visitorTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Minutes the visitor is ahead of Athens (negative = behind) at that moment.
export function minutesAheadOfTeacher(timeZone: string, timestamp: number = Date.now()) {
  try {
    return Math.round((zoneOffset(timestamp, timeZone) - zoneOffset(timestamp)) / 60_000);
  } catch {
    return 0;
  }
}

export function describeTimeDifference(minutesAhead: number) {
  const total = Math.abs(minutesAhead);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const parts = [
    hours ? `${hours} ${hours === 1 ? "hour" : "hours"}` : "",
    minutes ? `${minutes} minutes` : "",
  ].filter(Boolean);
  return `${parts.join(" ")} ${minutesAhead > 0 ? "ahead" : "behind"}`;
}

const MODERN_CITY_NAMES: Record<string, string> = {
  Calcutta: "Kolkata",
  Saigon: "Ho Chi Minh City",
  Kiev: "Kyiv",
  Rangoon: "Yangon",
  Katmandu: "Kathmandu",
};

export function timeZoneCity(timeZone: string) {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  return MODERN_CITY_NAMES[city] ?? city;
}

export function formatVisitorSlot(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.hour}:${value.minute} on ${value.weekday} ${value.day} ${value.month}`;
}

export function rowLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
