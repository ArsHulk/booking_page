import { env } from "cloudflare:workers";
import { headers } from "next/headers";

const ADMIN_COOKIE = "arsenios_admin";
const SESSION_VERSION = "v1";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

type AdminEnvironment = {
  ADMIN_PASSWORD?: string;
};

function adminPassword() {
  const password = (env as unknown as AdminEnvironment).ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      "ADMIN_PASSWORD is missing or too short. Add it as an encrypted Cloudflare secret.",
    );
  }
  return password;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`arsenios-booking:${adminPassword()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyAdminPassword(candidate: string) {
  const provided = new TextEncoder().encode(candidate);
  const expected = new TextEncoder().encode(adminPassword());
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", provided),
    crypto.subtle.digest("SHA-256", expected),
  ]);
  const providedBytes = new Uint8Array(providedDigest);
  const expectedBytes = new Uint8Array(expectedDigest);
  let difference = providedBytes.length ^ expectedBytes.length;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function adminFingerprint(request: Request) {
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  return sign(`login:${address}`);
}

export async function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = `${SESSION_VERSION}.${expiresAt}.${bytesToBase64Url(nonce)}`;
  return `${payload}.${await sign(payload)}`;
}

async function verifyAdminSession(token: string | undefined) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== SESSION_VERSION) return false;

  const expiresAt = Number(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + SESSION_SECONDS + 300
  ) {
    return false;
  }

  const payload = parts.slice(0, 3).join(".");
  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(parts[3]);
  } catch {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    signature,
    new TextEncoder().encode(payload),
  );
}

function cookieValue(cookieHeader: string | null) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === ADMIN_COOKIE) return valueParts.join("=");
  }
  return undefined;
}

export async function hasAdminSession(request?: Request) {
  const cookieHeader = request
    ? request.headers.get("cookie")
    : (await headers()).get("cookie");
  return verifyAdminSession(cookieValue(cookieHeader));
}

export async function requireAdmin(request: Request) {
  if (!(await hasAdminSession(request))) {
    throw new Response("Admin login required", { status: 401 });
  }
}

export function adminSessionCookie(token: string, secure = true) {
  return [
    `${ADMIN_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Strict",
    `Max-Age=${SESSION_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function expiredAdminSessionCookie(secure = true) {
  return [
    `${ADMIN_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Strict",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
