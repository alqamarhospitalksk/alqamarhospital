import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (currentUser.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const body = await request.json().catch(() => null);

  if (body?.resetPassword === true) {
    // A random one-time password, shown to management once on screen. It must be replaced before
    // the account can be used for anything else (mustChangePassword, checked on every page load in
    // workspace-shell.tsx). It used to be a guessable pattern from the user's number, which anyone
    // could have used to sign in as that user between the reset and their first change.
    const tempPassword = `AlQamar-${randomBytes(6).toString("hex")}`;
    try {
      const user = await db.user.update({ where: { id }, data: { passwordHash: hashPassword(tempPassword), mustChangePassword: true } });
      await db.session.deleteMany({ where: { userId: id } });
      await db.auditLog.create({ data: { action: "UPDATE", entity: "User", entityId: String(id), userId: currentUser.id, afterJson: JSON.stringify({ passwordReset: true }) } });
      return NextResponse.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role, active: user.active, createdAt: user.createdAt }, temporaryPassword: tempPassword });
    } catch { return NextResponse.json({ error: "User not found." }, { status: 404 }); }
  }

  const active = Boolean(body?.active);
  if (id === currentUser.id && !active) return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  try {
    const user = await db.user.update({ where: { id }, data: { active } });
    if (!active) await db.session.deleteMany({ where: { userId: id } });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "User", entityId: String(id), userId: currentUser.id, afterJson: JSON.stringify({ active }) } });
    return NextResponse.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role, active: user.active, createdAt: user.createdAt } });
  } catch { return NextResponse.json({ error: "User not found." }, { status: 404 }); }
}
