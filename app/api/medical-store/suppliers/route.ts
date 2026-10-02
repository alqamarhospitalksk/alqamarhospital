import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  // Purchase / Purchase Return pickers only ever want active suppliers (you can't buy from
  // a deactivated one); the Suppliers admin page passes this to also see & reactivate inactive ones.
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
  const suppliers = await db.supplier.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ suppliers });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const contactPerson = text(body?.contactPerson) || null;
  const phone = text(body?.phone) || null;
  const address = text(body?.address) || null;

  if (!name) return NextResponse.json({ error: "Enter a supplier name." }, { status: 400 });

  const supplier = await db.supplier.create({ data: { name, contactPerson, phone, address } });
  await db.auditLog.create({ data: { action: "CREATE", entity: "Supplier", entityId: String(supplier.id), userId: user.id, afterJson: JSON.stringify({ name }) } });
  return NextResponse.json({ supplier }, { status: 201 });
}
