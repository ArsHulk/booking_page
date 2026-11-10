import { env } from "cloudflare:workers";
import { TEACHER_TIME_ZONE } from "./calendar";
import {
  BookingEmailKind,
  CALENDAR_FILE_NAME,
  emailSubject,
  emailText,
  lessonCalendarFile,
  toBase64,
} from "./booking-email-content";

export type { BookingEmailKind };

type EmailEnvironment = {
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  ADMIN_NOTIFICATION_EMAIL?: string;
};

type BookingEmail = {
  id: string;
  version: number;
  kind: BookingEmailKind;
  studentName: string;
  studentEmail: string;
  startAt: Date;
  endAt?: Date;
};

type AdminBookingNotification = {
  id: string;
  version: number;
  studentName: string;
  studentEmail: string;
  startAt: Date;
  adminUrl: string;
};

function emailSettings() {
  const settings = env as unknown as EmailEnvironment;
  const apiKey = settings.BREVO_API_KEY?.trim();
  const from = settings.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error("BREVO_API_KEY or EMAIL_FROM is not configured.");
  }

  return { apiKey, from };
}

function lessonDate(startAt: Date) {
  return new Intl.DateTimeFormat("en-GB", {
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

async function idempotencyKey(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sendBookingEmail(message: BookingEmail) {
  const { apiKey, from } = emailSettings();
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Arsenios", email: from },
      to: [{ name: message.studentName, email: message.studentEmail }],
      subject: emailSubject(message.kind),
      textContent: emailText(message),
      ...(message.kind === "confirmed"
        ? {
            attachment: [
              { name: CALENDAR_FILE_NAME, content: toBase64(lessonCalendarFile(message)) },
            ],
          }
        : {}),
      headers: {
        "Idempotency-Key": await idempotencyKey(
          `${message.id}:${message.version}:${message.kind}:${message.studentEmail}`,
        ),
      },
      tags: ["drum-lesson-booking"],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 400 && /duplicate_parameter|duplicate/i.test(detail)) {
      return;
    }
    console.error("Brevo rejected a booking email", response.status, detail);
    throw new Error(`Brevo returned ${response.status}.`);
  }
}

export async function sendAdminBookingNotification(message: AdminBookingNotification) {
  const { apiKey, from } = emailSettings();
  const settings = env as unknown as EmailEnvironment;
  const notificationEmail = settings.ADMIN_NOTIFICATION_EMAIL?.trim();

  if (!notificationEmail) {
    throw new Error("ADMIN_NOTIFICATION_EMAIL is not configured.");
  }

  const when = lessonDate(message.startAt);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Arsenios Booking Page", email: from },
      to: [{ name: "Arsenios", email: notificationEmail }],
      replyTo: { name: message.studentName, email: message.studentEmail },
      subject: `New lesson request from ${message.studentName}`,
      textContent: [
        "New drum lesson request",
        "",
        `Name: ${message.studentName}`,
        `Email: ${message.studentEmail}`,
        `Requested time: ${when}`,
        "",
        `Open admin: ${message.adminUrl}`,
      ].join("\n"),
      headers: {
        "Idempotency-Key": await idempotencyKey(
          `${message.id}:${message.version}:admin-request:${notificationEmail}`,
        ),
      },
      tags: ["drum-lesson-admin-notification"],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 400 && /duplicate_parameter|duplicate/i.test(detail)) {
      return;
    }
    console.error("Brevo rejected an admin booking notification", response.status, detail);
    throw new Error(`Brevo returned ${response.status}.`);
  }
}
