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

  const returns = await db.medicineSaleReturn.findMany({
    orderBy: { id: "desc" },
    take: 50,
    include: { sale: true, createdBy: { select: { username: true } }, items: { include: { saleItem: { include: { medicineItem: true } } } } },
  });

  return NextResponse.json({
    returns: returns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      saleNumber: r.sale.saleNumber,
      reason: r.reason,
      restock: r.restock,
      totalRefund: r.totalRefund.toString(),
      createdBy: r.createdBy.username,
      createdAt: r.createdAt,
      items: r.items.map((i) => ({ medicineName: i.saleItem.medicineItem.name, quantity: i.quantity.toString(), unitPrice: i.unitPrice.toString(), total: i.total.toString() })),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const saleId = Number(body?.saleId);
  const reason = text(body?.reason);
  const restock = Boolean(body?.restock);
  const rawItems = Array.isArray(body?.items) ? body.items : [];

  const items: { saleItemId: number; quantity: number }[] = [];
  for (const raw of rawItems) {
    const record = raw as Record<string, unknown>;
    const saleItemId = Number(record?.saleItemId);
    const quantity = Number(record?.quantity);
    if (Number.isInteger(saleItemId) && Number.isFinite(quantity) && quantity > 0) items.push({ saleItemId, quantity });
  }

  if (!Number.isInteger(saleId) || !reason || items.length === 0) {
    return NextResponse.json({ error: "Select a sale, at least one item with a quantity, and enter a reason." }, { status: 400 });
  }

  try {
    const result = await runTransaction(async (transaction) => {
      const sale = await transaction.medicineSale.findUnique({ where: { id: saleId }, include: { items: true } });
      if (!sale) throw new Error("Sale not found.");

      const alreadyReturned = await transaction.medicineSaleReturnItem.groupBy({
        by: ["saleItemId"],
        where: { saleItem: { saleId } },
        _sum: { quantity: true },
      });
      const returnedMap = new Map(alreadyReturned.map((r) => [r.saleItemId, Number(r._sum.quantity ?? 0)]));

      const now = new Date();
      const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const sequenceKey = `SALERETURN:${dateKey}`;
      const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
      const returnNumber = `SRET-${dateKey}-${String(sequence.nextValue - 1).padStart(4, "0")}`;

      const returnItemsData: { saleItemId: number; batchId: number; quantity: number; unitPrice: number; total: number }[] = [];
      let totalRefund = 0;
      // The customer paid sale.total, not the sum of list prices: if there was a discount, each
      // returned item is refunded its share of what was really paid (e.g. paid 900 on 1,000 -> 90%).
      const paidRatio = Number(sale.subtotal) > 0 ? Number(sale.total) / Number(sale.subtotal) : 1;
      const refundedBefore = (await transaction.medicineSaleReturn.findMany({ where: { saleId }, select: { totalRefund: true } })).reduce((sum, r) => sum + Number(r.totalRefund), 0);

      for (const item of items) {
        const saleItem = sale.items.find((si) => si.id === item.saleItemId);
        if (!saleItem) throw new Error("One of the selected sale items does not belong to this sale.");
        const alreadyReturnedQty = returnedMap.get(item.saleItemId) ?? 0;
        const remainingReturnable = Number(saleItem.quantity) - alreadyReturnedQty;
        if (item.quantity > remainingReturnable) {
          throw new Error(`Cannot return ${item.quantity} — only ${remainingReturnable} of this item is still returnable.`);
        }
        const total = Math.round(item.quantity * Number(saleItem.unitPrice) * paidRatio * 100) / 100;
        totalRefund += total;
        returnItemsData.push({ saleItemId: saleItem.id, batchId: saleItem.batchId, quantity: item.quantity, unitPrice: Number(saleItem.unitPrice), total });
      }
      // Rounding across several partial returns must never refund more than was paid in total.
      if (refundedBefore + totalRefund > Number(sale.total) + 0.005) {
        const allowed = Math.max(0, Math.round((Number(sale.total) - refundedBefore) * 100) / 100);
        const scale = totalRefund > 0 ? allowed / totalRefund : 0;
        totalRefund = allowed;
        for (const row of returnItemsData) row.total = Math.round(row.total * scale * 100) / 100;
      }

      const saleReturn = await transaction.medicineSaleReturn.create({
        data: { returnNumber, saleId, reason, restock, totalRefund, createdById: user.id, items: { create: returnItemsData } },
        include: { items: true },
      });

      for (const item of returnItemsData) {
        const batch = await transaction.medicineBatch.findUnique({ where: { id: item.batchId } });
        if (!batch) continue;
        const beforeQuantity = Number(batch.quantityRemaining);
        const afterQuantity = restock ? beforeQuantity + item.quantity : beforeQuantity;
        if (restock) {
          await transaction.medicineBatch.update({ where: { id: item.batchId }, data: { quantityRemaining: { increment: item.quantity } } });
        }
        await transaction.medicineStockTransaction.create({
          data: {
            medicineItemId: batch.medicineItemId,
            batchId: item.batchId,
            type: "SALE_RETURN",
            quantity: item.quantity,
            beforeQuantity,
            afterQuantity,
            referenceType: "MedicineSaleReturn",
            referenceId: saleReturn.id,
            notes: restock ? "Returned to sellable stock" : "Quarantined / not restocked",
            createdById: user.id,
          },
        });
      }

      return saleReturn;
    });

    await db.auditLog.create({ data: { action: "REFUND", entity: "MedicineSaleReturn", entityId: String(result.id), userId: user.id, reason, afterJson: JSON.stringify({ returnNumber: result.returnNumber, restock, totalRefund: result.totalRefund.toString() }) } });
    return NextResponse.json({ return: { id: result.id, returnNumber: result.returnNumber, totalRefund: result.totalRefund.toString() } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the return." }, { status: 409 });
  }
}
