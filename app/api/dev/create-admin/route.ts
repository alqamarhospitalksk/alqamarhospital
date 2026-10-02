import { NextResponse } from "next/server";
import { isDevAuthenticated } from "../../../../lib/dev-auth";
import { logDevAction } from "../../../../lib/dev-db-tools";
import { hashPassword } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  if (!(await isDevAuthenticated())) return NextResponse.json({ error: "Developer authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const username = text(body?.username);
  const name = text(body?.name);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username) return NextResponse.json({ error: "Enter a username." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  // Upsert (not create-only): this is the recovery path for a wiped/locked-out database, so
  // it must also work when a MANAGEMENT account with this username already exists and just
  // needs its password reset.
  const user = await db.user.upsert({
    where: { username },
    update: { passwordHash: hashPassword(password), role: "MANAGEMENT", active: true, mustChangePassword: false, name: name || undefined },
    create: { username, passwordHash: hashPassword(password), role: "MANAGEMENT", name: name || null },
  });

  logDevAction(`CREATE_ADMIN: management account "${username}" created/reset (user id ${user.id})`);
  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
}
