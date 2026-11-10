// Student-facing email wording (English + Greek) and the calendar file
// attached to confirmation emails. Pure functions: no network, no secrets,
// so they can be checked without sending anything.
import { LESSON_MINUTES, TEACHER_TIME_ZONE } from "./calendar";

export const CONTACT_PHONE = "+30 694 263 1232";
export const CALENDAR_FILE_NAME = "drum-lesson.ics";

export type BookingEmailKind = "confirmed" | "rejected" | "cancelled";

export type BookingEmailMessage = {
  id: string;
  kind: BookingEmailKind;
  studentName: string;
  startAt: Date;
  endAt?: Date;
  // Link to the public booking page, so students can request another lesson.
  siteUrl?: string;
};

const DIVIDER = "— — —";

function lessonDate(startAt: Date, locale: "en-GB" | "el-GR") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TEACHER_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(startAt);
}

export function emailSubject(kind: BookingEmailKind) {
  if (kind === "confirmed") return "Your drum lesson is confirmed / Το μάθημα ντραμς σου επιβεβαιώθηκε";
  if (kind === "cancelled") return "Your drum lesson has been cancelled / Το μάθημα ντραμς σου ακυρώθηκε";
  return "Your drum lesson request / Το αίτημά σου για μάθημα ντραμς";
}

function rebookEnglish(siteUrl?: string) {
  if (!siteUrl) {
    return `Please feel free to rebook directly through the site, or contact me at ${CONTACT_PHONE}. Apologies for any inconvenience caused!`;
  }
  return [
    `Please feel free to request another lesson here: ${siteUrl}`,
    `Or contact me at ${CONTACT_PHONE}. Apologies for any inconvenience caused!`,
  ].join("\n");
}

function rebookGreek(siteUrl?: string) {
  if (!siteUrl) {
    return `Μπορείς να κλείσεις ξανά μάθημα απευθείας από τη σελίδα ή να επικοινωνήσεις μαζί μου στο ${CONTACT_PHONE}. Ζητώ συγγνώμη για την αναστάτωση!`;
  }
  return [
    `Μπορείς να ζητήσεις άλλο μάθημα εδώ: ${siteUrl}`,
    `Ή επικοινώνησε μαζί μου στο ${CONTACT_PHONE}. Ζητώ συγγνώμη για την αναστάτωση!`,
  ].join("\n");
}

function englishContent(message: BookingEmailMessage) {
  const when = lessonDate(message.startAt, "en-GB");

  if (message.kind === "confirmed") {
    return [
      `Hi ${message.studentName},`,
      `Your drum lesson is confirmed for ${when}.`,
      "",
      `To add this lesson to your calendar, open the attached file ("${CALENDAR_FILE_NAME}") on your phone/computer and tap 'Add' so you don't miss it!`,
      "",
      `If you need to make a change, please contact me directly at ${CONTACT_PHONE}.`,
      "",
      "If this is your first lesson, feel free to message me on Viber, Instagram or WhatsApp with your goals or anything you'd like me to know.",
    ].join("\n");
  }

  if (message.kind === "cancelled") {
    return [
      `Hi ${message.studentName}, unfortunately your confirmed lesson with Arsenios for ${when} has been cancelled.`,
      "Remember to remove this lesson if you've added it to your calendar - Sorry ):",
      rebookEnglish(message.siteUrl),
    ].join("\n\n");
  }

  return [
    `Hi ${message.studentName}, unfortunately your lesson with Arsenios has been rejected.`,
    rebookEnglish(message.siteUrl),
  ].join("\n\n");
}

function greekContent(message: BookingEmailMessage) {
  const when = lessonDate(message.startAt, "el-GR");

  if (message.kind === "confirmed") {
    return [
      `Γεια σου ${message.studentName},`,
      `Το μάθημα ντραμς σου επιβεβαιώθηκε για ${when}.`,
      "",
      `Για να προσθέσεις το μάθημα στο ημερολόγιό σου, άνοιξε το συνημμένο αρχείο ("${CALENDAR_FILE_NAME}") στο κινητό ή στον υπολογιστή σου και πάτησε «Προσθήκη», για να μην το χάσεις!`,
      "",
      `Αν χρειάζεσαι κάποια αλλαγή, επικοινώνησε απευθείας μαζί μου στο ${CONTACT_PHONE}.`,
      "",
      "Αν είναι το πρώτο σου μάθημα, μπορείς να μου στείλεις μήνυμα στο Viber, στο Instagram ή στο WhatsApp με τους στόχους σου ή οτιδήποτε θα ήθελες να ξέρω.",
    ].join("\n");
  }

  if (message.kind === "cancelled") {
    return [
      `Γεια σου ${message.studentName}, δυστυχώς το επιβεβαιωμένο μάθημά σου με τον Αρσένιο για ${when} ακυρώθηκε.`,
      "Μην ξεχάσεις να αφαιρέσεις το μάθημα από το ημερολόγιό σου, αν το είχες προσθέσει - Συγγνώμη ):",
      rebookGreek(message.siteUrl),
    ].join("\n\n");
  }

  return [
    `Γεια σου ${message.studentName}, δυστυχώς το αίτημά σου για μάθημα με τον Αρσένιο δεν μπόρεσε να γίνει δεκτό.`,
    rebookGreek(message.siteUrl),
  ].join("\n\n");
}

export function emailText(message: BookingEmailMessage) {
  return [englishContent(message), "", DIVIDER, "", greekContent(message)].join("\n");
}

// ---- Calendar file (.ics) for confirmed lessons ----

function icsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545: lines longer than 75 bytes are folded; never split a UTF-8 character.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentBytes + size > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function lessonCalendarFile(message: BookingEmailMessage, now = new Date()) {
  const endAt = message.endAt ?? new Date(message.startAt.getTime() + LESSON_MINUTES * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Arsenios Booking Page//Drum lessons//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${message.id}@arsenios-booking-page`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(message.startAt)}`,
    `DTEND:${icsDate(endAt)}`,
    `SUMMARY:${icsText("Drum lesson with Arsenios / Μάθημα ντραμς με τον Αρσένιο")}`,
    `DESCRIPTION:${icsText(
      `To change or cancel, please contact Arsenios at ${CONTACT_PHONE}.\nΓια αλλαγή ή ακύρωση, επικοινώνησε με τον Αρσένιο στο ${CONTACT_PHONE}.`,
    )}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText("Drum lesson in 1 hour / Μάθημα ντραμς σε 1 ώρα")}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
