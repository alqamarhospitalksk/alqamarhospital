import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { parseParameters } from "../../../../lib/lab-results";
import { serializeCatalogItem } from "../../../../lib/lab-catalog";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "LAB") return NextResponse.json({ error: "Lab access is required." }, { status: 403 });
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const price = body?.price === undefined ? undefined : Number(body.price);
  const active = body?.active === undefined ? undefined : Boolean(body.active);
  const defaultRemarks = typeof body?.defaultRemarks === "string" ? body.defaultRemarks.trim().slice(0, 500) || null : undefined;
  if (!Number.isInteger(id) || (name !== undefined && !name) || (price !== undefined && (!Number.isFinite(price) || price < 0))) return NextResponse.json({ error: "Enter valid test details." }, { status: 400 });
  const parsed = body?.parameters === undefined ? null : parseParameters(body.parameters);
  if (parsed && "error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    // Replacing the rows is safe for old reports: saved results hold their own copy of each
    // row's name, unit and range, and the link back to the template row just becomes empty.
    const item = await db.$transaction(async (tx) => {
      if (parsed) {
        await tx.diagnosticTestParameter.deleteMany({ where: { catalogItemId: id } });
        await tx.diagnosticTestParameter.createMany({ data: parsed.rows.map((row, index) => ({ ...row, catalogItemId: id, sortOrder: index })) });
      }
      return tx.diagnosticCatalogItem.update({
        where: { id },
        data: { ...(name === undefined ? {} : { name }), ...(price === undefined ? {} : { price }), ...(active === undefined ? {} : { active }), ...(defaultRemarks === undefined ? {} : { defaultRemarks }) },
        include: { parameters: { orderBy: { sortOrder: "asc" } } },
      });
    });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "DiagnosticCatalogItem", entityId: String(item.id), userId: user.id, afterJson: JSON.stringify({ name: item.name, price: item.price.toString(), active: item.active, ...(parsed ? { templateRows: parsed.rows.length } : {}) }) } });
    return NextResponse.json({ item: serializeCatalogItem(item) });
  } catch {
    return NextResponse.json({ error: "Unable to update this test." }, { status: 404 });
  }
}
