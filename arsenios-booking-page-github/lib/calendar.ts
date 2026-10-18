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

export function startOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

export function startOfMonth(date = new Date()) {
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

function zoneOffset(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEACHER_TIME_ZONE,
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

export function formatLongSlot(startAt: number, endAt: number) {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: TEACHER_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(startAt));
  return `${date}, ${formatTime(startAt)}–${formatTime(endAt)}`;
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

export function rowLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
