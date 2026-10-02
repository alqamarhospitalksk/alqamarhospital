import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = text(body?.name);

  const updated = await db.user.update({ where: { id: user.id }, data: { name: name || null } });
  return NextResponse.json({ user: { id: updated.id, username: updated.username, name: updated.name, role: updated.role } });
}
