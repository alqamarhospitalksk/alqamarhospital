import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { runTransaction } from "../../../../lib/transaction";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const returns = await db.medicinePurchaseReturn.findMany({
    orderBy: { id: "desc" },
    take: 50,
    include: { supplier: true, createdBy: { select: { username: true } }, items: { include: { batch: { include: { medicineItem: true } } } } },
  });

  return NextResponse.json({
    returns: returns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      supplier: r.supplier.name,
      reason: r.reason,
      totalAmount: r.totalAmount.toString(),
      refundMode: r.refundMode,
      createdBy: r.createdBy.username,
      createdAt: r.createdAt,
      items: r.items.map((i) => ({ medicineName: i.batch.medicineItem.name, batchNumber: i.batch.batchNumber, quantity: i.quantity.toString(), unitCost: i.unitCost.toString(), total: i.total.toString() })),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const supplierId = Number(body?.supplierId);
  const reason = text(body?.reason);
  const refundMode = text(body?.refundMode).toUpperCase() || "CASH";
  if (refundMode !== "CASH" && refundMode !== "CREDIT") {
    return NextResponse.json({ error: "Choose whether the supplier refunds cash or deducts it from your balance." }, { status: 400 });
  }
  const rawItems = Array.isArray(body?.items) ? body.items : [];

  const items: { batchId: number; quantity: number }[] = [];
  for (const raw of rawItems) {
    const record = raw as Record<string, unknown>;
    const batchId = Number(record?.batchId);
    const quantity = Number(record?.quantity);
    if (Number.isInteger(batchId) && Number.isFinite(quantity) && quantity > 0) items.push({ batchId, quantity });
  }

  if (!Number.isInteger(supplierId) || !reason || items.length === 0) {
    return NextResponse.json({ error: "Select a supplier, at least one batch with a quantity, and enter a reason." }, { status: 400 });
  }

  try {
    const result = await runTransaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new Error("Supplier not found.");

      const now = new Date();
      const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const sequenceKey = `PURCHRETURN:${dateKey}`;
      const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
      const returnNumber = `PRET-${dateKey}-${String(sequence.nextValue - 1).padStart(4, "0")}`;

      const returnItemsData: { batchId: number; quantity: number; unitCost: number; total: number }[] = [];
      let totalAmount = 0;

      for (const item of items) {
        const batch = await transaction.medicineBatch.findUnique({ where: { id: item.batchId }, include: { purchase: true } });
        if (!batch) throw new Error("One of the selected batches was not found.");
        if (batch.purchase.supplierId !== supplierId) throw new Error("A selected batch does not belong to this supplier's purchase.");
        if (item.quantity > Number(batch.quantityRemaining)) throw new Error(`Cannot return ${item.quantity} — only ${batch.quantityRemaining} remaining in this batch.`);
        const unitCost = Number(batch.purchasePrice);
        const total = item.quantity * unitCost;
        totalAmount += total;
        returnItemsData.push({ batchId: item.batchId, quantity: item.quantity, unitCost, total });
      }

      const purchaseReturn = await transaction.medicinePurchaseReturn.create({
        data: { returnNumber, supplierId, reason, totalAmount, refundMode, createdById: user.id, items: { create: returnItemsData } },
      });

      // CASH: the supplier hands the money back — post it as a negative expense so it nets against
      // Total Expenses / adds back to Net Revenue on the Management Dashboard, mirroring how
      // MEDICAL_STORE_WASTAGE (a positive expense) records the opposite cash movement.
      // CREDIT: no money moves; it only lowers the supplier balance (see supplier-payments route).
      if (refundMode === "CASH" && totalAmount > 0) {
        await transaction.expense.create({
          data: {
            category: "SUPPLIER_REFUND",
            amount: -totalAmount,
            method: "CASH",
            note: `Purchase return ${returnNumber} to ${supplier.name} — ${reason}`,
            expenseDate: new Date(),
            createdById: user.id,
          },
        });
      }

      for (const item of returnItemsData) {
        const batch = await transaction.medicineBatch.findUnique({ where: { id: item.batchId } });
        if (!batch) continue;
        const beforeQuantity = Number(batch.quantityRemaining);
        await transaction.medicineBatch.update({ where: { id: item.batchId }, data: { quantityRemaining: { decrement: item.quantity } } });
        await transaction.medicineStockTransaction.create({
          data: {
            medicineItemId: batch.medicineItemId,
            batchId: item.batchId,
            type: "PURCHASE_RETURN",
            quantity: item.quantity,
            beforeQuantity,
            afterQuantity: beforeQuantity - item.quantity,
            referenceType: "MedicinePurchaseReturn",
            referenceId: purchaseReturn.id,
            notes: reason,
            createdById: user.id,
          },
        });
      }

      return purchaseReturn;
    });

    await db.auditLog.create({ data: { action: "UPDATE", entity: "MedicinePurchaseReturn", entityId: String(result.id), userId: user.id, reason, afterJson: JSON.stringify({ returnNumber: result.returnNumber, totalAmount: result.totalAmount.toString() }) } });
    return NextResponse.json({ return: { id: result.id, returnNumber: result.returnNumber, totalAmount: result.totalAmount.toString() } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the return." }, { status: 409 });
  }
}
