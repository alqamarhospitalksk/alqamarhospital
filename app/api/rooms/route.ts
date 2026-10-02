import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MANAGEMENT"]);
  if (denied) return denied;
  const rooms = await db.roomBed.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ rooms: rooms.map((room) => ({ ...room, dailyRate: room.dailyRate.toString() })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const roomType = text(body?.roomType);
  const dailyRate = Number(body?.dailyRate);
  if (!name || !roomType || !Number.isFinite(dailyRate) || dailyRate < 0) return NextResponse.json({ error: "Enter a valid bed name, room type, and daily rate." }, { status: 400 });
  try {
    const room = await db.roomBed.create({ data: { name, roomType, dailyRate } });
    await db.auditLog.create({ data: { action: "CREATE", entity: "RoomBed", entityId: String(room.id), userId: user.id, afterJson: JSON.stringify({ name, roomType, dailyRate }) } });
    return NextResponse.json({ room: { ...room, dailyRate: room.dailyRate.toString() } }, { status: 201 });
  } catch { return NextResponse.json({ error: "A room or bed with this name already exists." }, { status: 409 }); }
}
