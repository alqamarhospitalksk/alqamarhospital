import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { ACTIVE_STATUSES, ROOM_CATEGORIES } from "../../../../lib/admission";

const unitTypes = ["ROOM", "BED"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const name = body?.name === undefined ? undefined : String(body.name).trim();
  const roomType = body?.roomType === undefined ? undefined : String(body.roomType).trim();
  const dailyRate = body?.dailyRate === undefined ? undefined : Number(body.dailyRate);
  const category = body?.category === undefined ? undefined : String(body.category).trim().toUpperCase();
  const unitType = body?.unitType === undefined ? undefined : String(body.unitType).trim().toUpperCase();
  const active = body?.active === undefined ? undefined : Boolean(body.active);
  if (!Number.isInteger(id) || name === "" || roomType === "" || dailyRate !== undefined && (!Number.isFinite(dailyRate) || dailyRate < 0)) return NextResponse.json({ error: "Enter valid room details." }, { status: 400 });
  if (category !== undefined && !(ROOM_CATEGORIES as readonly string[]).includes(category) || unitType !== undefined && !unitTypes.includes(unitType)) return NextResponse.json({ error: "Select a valid category and whether the charge is per room or per bed." }, { status: 400 });
  // Taking a bed out of use while a patient is in it would hide where that patient is.
  if (active === false) {
    const occupant = await db.admission.findFirst({ where: { roomBedId: id, status: { in: ACTIVE_STATUSES } } });
    if (occupant) return NextResponse.json({ error: `This bed is occupied (${occupant.admissionNumber}). Move or discharge the patient first.` }, { status: 409 });
  }
  try {
    const room = await db.roomBed.update({
      where: { id },
      data: {
        ...(name === undefined ? {} : { name }),
        ...(roomType === undefined ? {} : { roomType }),
        ...(dailyRate === undefined ? {} : { dailyRate }),
        ...(category === undefined ? {} : { category }),
        ...(unitType === undefined ? {} : { unitType }),
        ...(active === undefined ? {} : { active }),
      },
    });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "RoomBed", entityId: String(id), userId: user.id, afterJson: JSON.stringify({ name: room.name, roomType: room.roomType, dailyRate: room.dailyRate.toString(), category: room.category, unitType: room.unitType, active: room.active }) } });
    return NextResponse.json({ room: { ...room, dailyRate: room.dailyRate.toString() } });
  } catch { return NextResponse.json({ error: "Room or bed not found." }, { status: 404 }); }
}
