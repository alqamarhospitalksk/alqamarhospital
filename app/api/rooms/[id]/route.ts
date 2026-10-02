import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const name = body?.name === undefined ? undefined : String(body.name).trim();
  const roomType = body?.roomType === undefined ? undefined : String(body.roomType).trim();
  const dailyRate = body?.dailyRate === undefined ? undefined : Number(body.dailyRate);
  const active = body?.active === undefined ? undefined : Boolean(body.active);
  if (!Number.isInteger(id) || name === "" || roomType === "" || dailyRate !== undefined && (!Number.isFinite(dailyRate) || dailyRate < 0)) return NextResponse.json({ error: "Enter valid room details." }, { status: 400 });
  try {
    const room = await db.roomBed.update({ where: { id }, data: { ...(name === undefined ? {} : { name }), ...(roomType === undefined ? {} : { roomType }), ...(dailyRate === undefined ? {} : { dailyRate }), ...(active === undefined ? {} : { active }) } });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "RoomBed", entityId: String(id), userId: user.id, afterJson: JSON.stringify({ name: room.name, roomType: room.roomType, dailyRate: room.dailyRate.toString(), active: room.active }) } });
    return NextResponse.json({ room: { ...room, dailyRate: room.dailyRate.toString() } });
  } catch { return NextResponse.json({ error: "Room or bed not found." }, { status: 404 }); }
}
