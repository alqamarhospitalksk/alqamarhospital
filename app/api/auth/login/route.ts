import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { clearFailures, lockedMinutes, recordFailure } from "../../../../lib/login-throttle";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  // Throttle per username only: every PC in the clinic shares one IP address, so an IP-based lock
  // would lock all staff out after a few typos.
  const keys = [`user:${username.toLowerCase()}`];
  const wait = lockedMinutes(...keys);
  if (wait > 0) {
    return NextResponse.json({ error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` }, { status: 429 });
  }

  const user = await db.user.findUnique({ where: { username } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    recordFailure(...keys);
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }
  clearFailures(...keys);

  await createSession(user.id);
  await db.auditLog.create({
    data: { action: "LOGIN", entity: "User", entityId: String(user.id), userId: user.id },
  });

  return NextResponse.json({ user: { username: user.username, role: user.role, mustChangePassword: user.mustChangePassword } });
}
