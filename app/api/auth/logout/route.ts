import { NextResponse } from "next/server";
import { deleteCurrentSession, getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

export async function POST() {
  const user = await getCurrentUser();
  await deleteCurrentSession();

  if (user) {
    await db.auditLog.create({
      data: { action: "LOGOUT", entity: "User", entityId: String(user.id), userId: user.id },
    });
  }

  return NextResponse.json({ success: true });
}
