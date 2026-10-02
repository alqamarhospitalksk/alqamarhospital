import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword, verifyPassword } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (newPassword.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });

  // The forced one-time-password flow (mustChangePassword) trusts the session the user just
  // logged into with that temp password — no extra check needed there. A voluntary change
  // from the profile menu is a different story: it must re-verify the current password so
  // someone at an unlocked, still-logged-in session can't silently lock the real owner out.
  if (!user.mustChangePassword) {
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword), mustChangePassword: false },
  });
  await db.auditLog.create({ data: { action: "UPDATE", entity: "User", entityId: String(user.id), userId: user.id, afterJson: JSON.stringify({ passwordChanged: true }) } });

  return NextResponse.json({ ok: true });
}
