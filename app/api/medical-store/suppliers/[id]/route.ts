import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const supplierId = Number((await context.params).id);
  if (!Number.isInteger(supplierId)) return NextResponse.json({ error: "Invalid supplier ID." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const name = body?.name === undefined ? undefined : text(body.name);
  const contactPerson = body?.contactPerson === undefined ? undefined : (text(body.contactPerson) || null);
  const phone = body?.phone === undefined ? undefined : (text(body.phone) || null);
  const address = body?.address === undefined ? undefined : (text(body.address) || null);
  const active = typeof body?.active === "boolean" ? body.active : undefined;

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Enter a supplier name." }, { status: 400 });
  }

  try {
    const supplier = await db.supplier.update({
      where: { id: supplierId },
      data: {
        ...(name === undefined ? {} : { name }),
        ...(contactPerson === undefined ? {} : { contactPerson }),
        ...(phone === undefined ? {} : { phone }),
        ...(address === undefined ? {} : { address }),
        ...(active === undefined ? {} : { active }),
      },
    });
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Supplier",
        entityId: String(supplier.id),
        userId: user.id,
        afterJson: JSON.stringify({ name: supplier.name, active: supplier.active }),
      },
    });
    return NextResponse.json({ supplier });
  } catch {
    return NextResponse.json({ error: "Unable to update supplier." }, { status: 404 });
  }
}
