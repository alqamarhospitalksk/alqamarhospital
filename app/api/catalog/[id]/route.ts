import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "LAB") return NextResponse.json({ error: "Lab access is required." }, { status: 403 });
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const price = body?.price === undefined ? undefined : Number(body.price);
  const active = body?.active === undefined ? undefined : Boolean(body.active);
  if (!Number.isInteger(id) || (name !== undefined && !name) || (price !== undefined && (!Number.isFinite(price) || price < 0))) return NextResponse.json({ error: "Enter valid test details." }, { status: 400 });
  try {
    const item = await db.diagnosticCatalogItem.update({ where: { id }, data: { ...(name === undefined ? {} : { name }), ...(price === undefined ? {} : { price }), ...(active === undefined ? {} : { active }) } });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "DiagnosticCatalogItem", entityId: String(item.id), userId: user.id, afterJson: JSON.stringify({ name: item.name, price: item.price.toString(), active: item.active }) } });
    return NextResponse.json({ item: { ...item, price: item.price.toString() } });
  } catch {
    return NextResponse.json({ error: "Unable to update this test." }, { status: 404 });
  }
}
