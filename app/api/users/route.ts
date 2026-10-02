import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "../../../lib/auth";
import { db } from "../../../lib/db";

const roles = ["OPERATOR", "MANAGEMENT", "LAB", "MEDICAL_STORE"] as const;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const users = await db.user.findMany({ orderBy: { username: "asc" }, select: { id: true, name: true, username: true, role: true, active: true, createdAt: true } });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (currentUser.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const username = text(body?.username).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";
  const role = text(body?.role).toUpperCase();
  if (!name || !/^[a-z0-9._-]{3,80}$/.test(username) || password.length < 8 || !roles.includes(role as (typeof roles)[number])) return NextResponse.json({ error: "Enter a name; username must be 3-80 characters, password at least 8 characters, and role valid." }, { status: 400 });
  try {
    const user = await db.user.create({ data: { name, username, passwordHash: hashPassword(password), role: role as "OPERATOR", mustChangePassword: true } });
    await db.auditLog.create({ data: { action: "CREATE", entity: "User", entityId: String(user.id), userId: currentUser.id, afterJson: JSON.stringify({ name, username, role }) } });
    return NextResponse.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role, active: user.active, createdAt: user.createdAt } }, { status: 201 });
  } catch { return NextResponse.json({ error: "That username is already in use." }, { status: 409 }); }
}
