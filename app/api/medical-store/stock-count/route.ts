import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { toDateColumnBoundary } from "../../../../lib/date-range";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const batches = await db.medicineBatch.findMany({
    where: { quantityRemaining: { gt: 0 } },
    orderBy: [{ medicineItem: { name: "asc" } }, { expiryDate: "asc" }],
    include: { medicineItem: true },
  });

  return NextResponse.json({
    batches: batches.map((b) => ({
      batchId: b.id,
      medicineName: b.medicineItem.name,
      unit: b.medicineItem.unit,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      systemQuantity: Number(b.quantityRemaining),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const note = text(body?.note);
  const rawCounts = Array.isArray(body?.counts) ? body.counts : [];

  const counts: { batchId: number; systemQuantity: number; countedQuantity: number }[] = [];
  for (const raw of rawCounts) {
    const record = raw as Record<string, unknown>;
    const batchId = Number(record?.batchId);
    const systemQuantity = Number(record?.systemQuantity);
    const countedQuantity = Number(record?.countedQuantity);
    if (!Number.isInteger(batchId) || !Number.isFinite(systemQuantity) || !Number.isFinite(countedQuantity) || countedQuantity < 0) {
      return NextResponse.json({ error: "Each counted quantity must be zero or more." }, { status: 400 });
    }
    if (countedQuantity !== systemQuantity) counts.push({ batchId, systemQuantity, countedQuantity });
  }
  if (counts.length === 0) return NextResponse.json({ error: "No differences to save — every count matches the system." }, { status: 400 });

  try {
    const result = await db.$transaction(async (transaction) => {
      const batches = await transaction.medicineBatch.findMany({
        where: { id: { in: counts.map((c) => c.batchId) } },
        include: { medicineItem: true },
      });
      const byId = new Map(batches.map((b) => [b.id, b]));

      // If stock moved since the count sheet was loaded (a sale, return, etc.), the count is stale
      // for that batch — refuse rather than silently overwrite a real movement.
      const stale = counts.filter((c) => {
        const batch = byId.get(c.batchId);
        return !batch || Number(batch.quantityRemaining) !== c.systemQuantity;
      });
      if (stale.length > 0) {
        const names = stale.map((c) => byId.get(c.batchId)?.medicineItem.name ?? `batch #${c.batchId}`).join(", ");
        throw new Error(`Stock changed while you were counting (${names}). Reload the sheet and recount those.`);
      }

      let gains = 0;
      let losses = 0;
      let lossValue = 0;
      for (const c of counts) {
        const batch = byId.get(c.batchId)!;
        const difference = c.countedQuantity - c.systemQuantity;
        await transaction.medicineBatch.update({ where: { id: batch.id }, data: { quantityRemaining: c.countedQuantity } });
        const reason = `Stock count: system ${c.systemQuantity}, counted ${c.countedQuantity} (${difference > 0 ? "+" : ""}${difference})${note ? ` — ${note}` : ""}`;
        const adjustment = await transaction.medicineStockAdjustment.create({
          data: { medicineItemId: batch.medicineItemId, batchId: batch.id, type: "STOCK_COUNT", quantity: Math.abs(difference), reason, adjustedById: user.id },
        });
        await transaction.medicineStockTransaction.create({
          data: {
            medicineItemId: batch.medicineItemId,
            batchId: batch.id,
            type: difference > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            quantity: Math.abs(difference),
            beforeQuantity: c.systemQuantity,
            afterQuantity: c.countedQuantity,
            referenceType: "MedicineStockAdjustment",
            referenceId: adjustment.id,
            notes: reason,
            createdById: user.id,
          },
        });
        if (difference > 0) {
          gains += 1;
        } else {
          losses += 1;
          lossValue += Math.abs(difference) * Number(batch.purchasePrice);
        }
      }

      // Missing stock is money already spent and now lost — the same as damaged/expired stock,
      // so it's posted as store wastage (at cost). Surplus stock isn't treated as income.
      if (lossValue > 0) {
        const now = new Date();
        await transaction.expense.create({
          data: {
            category: "MEDICAL_STORE_WASTAGE",
            amount: lossValue,
            method: "CASH",
            expenseDate: toDateColumnBoundary(now),
            note: `Stock count shortfall on ${losses} batch${losses === 1 ? "" : "es"}${note ? ` — ${note}` : ""}`,
            createdById: user.id,
          },
        });
      }
      return { gains, losses, lossValue };
    });

    await db.auditLog.create({ data: { action: "UPDATE", entity: "MedicineStockCount", entityId: new Date().toISOString().slice(0, 10), userId: user.id, reason: note || null, afterJson: JSON.stringify(result) } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the stock count." }, { status: 409 });
  }
}
