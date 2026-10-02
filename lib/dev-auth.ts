import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Deliberately decoupled from the app's normal DB-backed Session model (see lib/auth.ts).
// The /dev console can run "Clean database", which truncates every table including
// Sessions — a session-table-backed login would lock the developer out mid-operation.
// This cookie is self-contained (HMAC-signed, no DB lookup), so it survives a Clean/Restore.
const DEV_COOKIE = "careledger_dev_session";
const DEV_SESSION_HOURS = 4;

function secretKey() {
  const password = process.env.DEV_ACCESS_PASSWORD;
  if (!password) throw new Error("DEV_ACCESS_PASSWORD is not configured on the server.");
  return createHash("sha256").update(password).digest();
}

// The /dev console can wipe or restore the whole database, so on a live server it is switched off
// unless ENABLE_DEV_CONSOLE=true is set deliberately (and only for as long as it is needed).
export function isDevConsoleEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_CONSOLE === "true";
}

export function isDevPasswordConfigured() {
  return Boolean(process.env.DEV_ACCESS_PASSWORD);
}

export function verifyDevPassword(password: string) {
  const expected = process.env.DEV_ACCESS_PASSWORD;
  if (!isDevConsoleEnabled() || !expected || !password) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createDevSession() {
  const expiresAt = Date.now() + DEV_SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expiresAt);
  const signature = createHmac("sha256", secretKey()).update(payload).digest("hex");
  const cookieStore = await cookies();
  cookieStore.set(DEV_COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export async function isDevAuthenticated() {
  if (!isDevConsoleEnabled()) return false;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(DEV_COOKIE)?.value;
    if (!token) return false;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;

    const expected = createHmac("sha256", secretKey()).update(payload).digest("hex");
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

    const expiresAt = Number(payload);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function clearDevSession() {
  const cookieStore = await cookies();
  cookieStore.delete(DEV_COOKIE);
}
