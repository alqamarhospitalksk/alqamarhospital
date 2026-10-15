import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { ACTIVE_STATUSES, ROOM_CATEGORIES } from "../../../lib/admission";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const unitTypes = ["ROOM", "BED"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MANAGEMENT"]);
  if (denied) return denied;
  const [rooms, occupied] = await Promise.all([
    db.roomBed.findMany({ orderBy: { name: "asc" } }),
    db.admission.findMany({ where: { status: { in: ACTIVE_STATUSES }, roomBedId: { not: null } }, select: { roomBedId: true, admissionNumber: true, admittedAt: true, patient: { select: { name: true, mrNumber: true } } } }),
  ]);
  const occupiedBy = new Map(occupied.map((a) => [a.roomBedId, { admissionNumber: a.admissionNumber, admittedAt: a.admittedAt, patientName: a.patient.name, mrNumber: a.patient.mrNumber }]));
  return NextResponse.json({ rooms: rooms.map((room) => ({ ...room, dailyRate: room.dailyRate.toString(), occupiedBy: occupiedBy.get(room.id) ?? null })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const roomType = text(body?.roomType);
  const dailyRate = Number(body?.dailyRate);
  const category = text(body?.category).toUpperCase() || "WARD";
  const unitType = text(body?.unitType).toUpperCase() || "BED";
  if (!name || !roomType || !Number.isFinite(dailyRate) || dailyRate < 0) return NextResponse.json({ error: "Enter a valid bed name, room type, and daily rate." }, { status: 400 });
  if (!(ROOM_CATEGORIES as readonly string[]).includes(category) || !unitTypes.includes(unitType)) return NextResponse.json({ error: "Select a valid category and whether the charge is per room or per bed." }, { status: 400 });
  try {
    const room = await db.roomBed.create({ data: { name, roomType, dailyRate, category, unitType } });
    await db.auditLog.create({ data: { action: "CREATE", entity: "RoomBed", entityId: String(room.id), userId: user.id, afterJson: JSON.stringify({ name, roomType, dailyRate, category, unitType }) } });
    return NextResponse.json({ room: { ...room, dailyRate: room.dailyRate.toString() } }, { status: 201 });
  } catch { return NextResponse.json({ error: "A room or bed with this name already exists." }, { status: 409 }); }
}
