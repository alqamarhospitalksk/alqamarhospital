import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const itemId = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const restock = Number(body?.restock ?? 0);
  const name = body?.name === undefined ? undefined : text(body.name);
  const unit = body?.unit === undefined ? undefined : text(body.unit);
  const lowStockAt = body?.lowStockAt === undefined ? undefined : Number(body.lowStockAt);
  const unitPrice = body?.unitPrice === undefined ? undefined : Number(body.unitPrice);
  const costPaid = body?.costPaid === undefined || body?.costPaid === "" ? undefined : Number(body.costPaid);
  const method = text(body?.method).toUpperCase() || "CASH";
  if (!Number.isInteger(itemId) || restock < 0 || !Number.isFinite(restock) || (name !== undefined && !name) || (unit !== undefined && !unit) || [lowStockAt, unitPrice].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0)) || (costPaid !== undefined && (!Number.isFinite(costPaid) || costPaid < 0)) || !methods.includes(method)) return NextResponse.json({ error: "Enter valid inventory details." }, { status: 400 });

  try {
    const item = await db.$transaction(async (transaction) => {
      const current = await transaction.inventoryItem.findUnique({ where: { id: itemId } });
      if (!current) throw new Error("Inventory item not found.");
      const updated = await transaction.inventoryItem.update({ where: { id: itemId }, data: { ...(name === undefined ? {} : { name }), ...(unit === undefined ? {} : { unit }), ...(lowStockAt === undefined ? {} : { lowStockAt }), ...(unitPrice === undefined ? {} : { unitPrice }) , ...(restock > 0 ? { quantity: { increment: restock } } : {}) } });
      if (restock > 0) {
        const reason = text(body?.reason) || "Manual restock";
        await transaction.inventoryTransaction.create({ data: { inventoryItemId: itemId, userId: user.id, type: "RESTOCK", quantity: restock, reason } });
        // This restock is a real purchase — record it as a hospital expense too, same as
        // opening stock, so it counts toward Total Expenses / Net Revenue on the
        // Management Dashboard and shows up in the Expenses ledger.
        const referencePrice = unitPrice ?? Number(current.unitPrice);
        const cost = costPaid ?? restock * referencePrice;
        if (cost > 0) {
          await transaction.expense.create({
            data: {
              category: "INVENTORY",
              amount: cost,
              method: method as "CASH",
              note: `Restock: ${updated.name} — ${restock} ${updated.unit}. ${reason}`,
              expenseDate: new Date(),
              createdById: user.id,
            },
          });
        }
      }
      return updated;
    });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "InventoryItem", entityId: String(item.id), userId: user.id, reason: text(body?.reason) || null, afterJson: JSON.stringify({ quantity: item.quantity.toString(), restock }) } });
    return NextResponse.json({ item: { ...item, quantity: item.quantity.toString(), lowStockAt: item.lowStockAt.toString(), unitPrice: item.unitPrice.toString() } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update inventory." }, { status: 404 }); }
}
