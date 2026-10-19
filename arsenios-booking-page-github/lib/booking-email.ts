import { env } from "cloudflare:workers";
import { TEACHER_TIME_ZONE } from "./calendar";

const CONTACT_PHONE = "+30 694 263 1232";

type EmailEnvironment = {
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  ADMIN_NOTIFICATION_EMAIL?: string;
};

export type BookingEmailKind = "confirmed" | "rejected" | "cancelled";

type BookingEmail = {
  id: string;
  version: number;
  kind: BookingEmailKind;
  studentName: string;
  studentEmail: string;
  startAt: Date;
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

function subject(kind: BookingEmailKind) {
  if (kind === "confirmed") return "Your drum lesson is confirmed";
  if (kind === "cancelled") return "Your drum lesson has been cancelled";
  return "Your drum lesson request";
}

function content(message: BookingEmail) {
  const when = lessonDate(message.startAt);

  if (message.kind === "confirmed") {
    return [
      `Hi ${message.studentName},`,
      `Your drum lesson is confirmed for ${when}.`,
      "",
      `If you need to make a change, please contact me directly at ${CONTACT_PHONE}.`,
      "",
      "If this is your first lesson, feel free to message me on Viber, Instagram or WhatsApp with your goals or anything you'd like me to know.",
    ].join("\n");
  }

  if (message.kind === "cancelled") {
    return [
      `Hi ${message.studentName}, unfortunately your confirmed lesson with Arsenios for ${when} has been cancelled.`,
      `Please feel free to rebook directly through the site, or contact me at ${CONTACT_PHONE}. Apologies for any inconvenience caused!`,
    ].join("\n\n");
  }

  return [
    `Hi ${message.studentName}, unfortunately your lesson with Arsenios has been rejected.`,
    `Please feel free to rebook directly through the site, or contact me at ${CONTACT_PHONE}. Apologies for any inconvenience caused!`,
  ].join("\n\n");
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
      subject: subject(message.kind),
      textContent: content(message),
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
