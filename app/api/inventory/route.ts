import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const categories = ["MEDICINE", "TOOL", "CONSUMABLE"];
const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MANAGEMENT"]);
  if (denied) return denied;
  const items = await db.inventoryItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ items: items.map((item) => ({ ...item, quantity: item.quantity.toString(), lowStockAt: item.lowStockAt.toString(), unitPrice: item.unitPrice.toString() })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const category = text(body?.category).toUpperCase();
  const unit = text(body?.unit);
  const quantity = Number(body?.quantity ?? 0);
  const lowStockAt = Number(body?.lowStockAt ?? 0);
  const unitPrice = Number(body?.unitPrice ?? 0);
  const method = text(body?.method).toUpperCase() || "CASH";
  if (!name || !categories.includes(category) || !unit || ![quantity, lowStockAt, unitPrice].every((value) => Number.isFinite(value) && value >= 0) || !methods.includes(method)) return NextResponse.json({ error: "Enter valid inventory details." }, { status: 400 });
  try {
    const item = await db.$transaction(async (transaction) => {
      const created = await transaction.inventoryItem.create({ data: { name, category, unit, quantity, lowStockAt, unitPrice } });
      if (quantity > 0) {
        await transaction.inventoryTransaction.create({ data: { inventoryItemId: created.id, userId: user.id, type: "RESTOCK", quantity, reason: "Initial stock" } });
        // The opening stock is a real purchase — record it as a hospital expense too, so it
        // counts toward Total Expenses / Net Revenue on the Management Dashboard and shows
        // up in the Expenses ledger, same as any other cost.
        const cost = quantity * unitPrice;
        if (cost > 0) {
          await transaction.expense.create({
            data: {
              category: "INVENTORY",
              amount: cost,
              method: method as "CASH",
              note: `Opening stock: ${name} — ${quantity} ${unit} @ PKR ${unitPrice}/${unit}`,
              expenseDate: new Date(),
              createdById: user.id,
            },
          });
        }
      }
      return created;
    });
    await db.auditLog.create({ data: { action: "CREATE", entity: "InventoryItem", entityId: String(item.id), userId: user.id, afterJson: JSON.stringify({ name, category, quantity }) } });
    return NextResponse.json({ item: { ...item, quantity: item.quantity.toString(), lowStockAt: item.lowStockAt.toString(), unitPrice: item.unitPrice.toString() } }, { status: 201 });
  } catch { return NextResponse.json({ error: "An inventory item with this name and category already exists." }, { status: 409 }); }
}
