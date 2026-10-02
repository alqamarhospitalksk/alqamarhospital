import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const types = ["DAMAGE", "EXPIRED", "RETURN", "CORRECTION"];

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const adjustments = await db.medicineStockAdjustment.findMany({
    orderBy: { id: "desc" },
    take: 50,
    include: { medicineItem: true, batch: true, adjustedBy: { select: { username: true } } },
  });

  return NextResponse.json({
    adjustments: adjustments.map((a) => ({
      id: a.id,
      medicineName: a.medicineItem.name,
      batchNumber: a.batch.batchNumber,
      type: a.type,
      quantity: a.quantity.toString(),
      reason: a.reason,
      adjustedBy: a.adjustedBy.username,
      createdAt: a.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const batchId = Number(body?.batchId);
  const type = text(body?.type).toUpperCase();
  const quantity = Number(body?.quantity);
  const reason = text(body?.reason);

  if (!Number.isInteger(batchId) || !types.includes(type) || !Number.isFinite(quantity) || quantity <= 0 || !reason) {
    return NextResponse.json({ error: "Select a batch, a valid adjustment type, a positive quantity, and a reason." }, { status: 400 });
  }

  try {
    const adjustment = await db.$transaction(async (transaction) => {
      const batch = await transaction.medicineBatch.findUnique({ where: { id: batchId }, include: { medicineItem: true } });
      if (!batch) throw new Error("Batch not found.");
      if (quantity > Number(batch.quantityRemaining)) throw new Error("Adjustment quantity exceeds remaining batch stock.");

      const beforeQuantity = Number(batch.quantityRemaining);
      await transaction.medicineBatch.update({ where: { id: batchId }, data: { quantityRemaining: { decrement: quantity } } });
      const created = await transaction.medicineStockAdjustment.create({
        data: { medicineItemId: batch.medicineItemId, batchId, type, quantity, reason, adjustedById: user.id },
      });
      await transaction.medicineStockTransaction.create({
        data: {
          medicineItemId: batch.medicineItemId,
          batchId,
          type: "ADJUSTMENT_OUT",
          quantity,
          beforeQuantity,
          afterQuantity: beforeQuantity - quantity,
          referenceType: "MedicineStockAdjustment",
          referenceId: created.id,
          notes: reason,
          createdById: user.id,
        },
      });

      // Damaged/expired stock is a real loss of the money already spent on it — post it as a
      // hospital expense (at cost, not sale price) so it counts against Total Expenses / Net
      // Revenue on the Management Dashboard, same as the app/api/inventory/route.ts opening-
      // stock precedent.
      if (type === "DAMAGE" || type === "EXPIRED") {
        const cost = quantity * Number(batch.purchasePrice);
        if (cost > 0) {
          await transaction.expense.create({
            data: {
              category: "MEDICAL_STORE_WASTAGE",
              amount: cost,
              method: "CASH",
              note: `${type === "DAMAGE" ? "Damaged" : "Expired"} stock: ${batch.medicineItem.name} (batch ${batch.batchNumber}) — ${quantity} ${batch.medicineItem.unit.toLowerCase()} — ${reason}`,
              expenseDate: new Date(),
              createdById: user.id,
            },
          });
        }
      }

      return created;
    });

    await db.auditLog.create({ data: { action: "UPDATE", entity: "MedicineStockAdjustment", entityId: String(adjustment.id), userId: user.id, reason, afterJson: JSON.stringify({ type, quantity }) } });
    return NextResponse.json({ adjustment: { ...adjustment, quantity: adjustment.quantity.toString() } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the adjustment." }, { status: 409 });
  }
}
