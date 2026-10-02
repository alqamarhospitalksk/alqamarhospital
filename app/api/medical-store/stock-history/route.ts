import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const medicineId = Number(params.get("medicineId"));
  if (!Number.isInteger(medicineId)) return NextResponse.json({ error: "Select a medicine." }, { status: 400 });

  const medicine = await db.medicineItem.findUnique({
    where: { id: medicineId },
    include: { batches: { where: { quantityRemaining: { gt: 0 } } } },
  });
  if (!medicine) return NextResponse.json({ error: "Medicine not found." }, { status: 404 });

  const movements = await db.medicineStockTransaction.findMany({
    where: { medicineItemId: medicineId },
    orderBy: { id: "desc" },
    take: 500,
    include: { batch: { select: { batchNumber: true, expiryDate: true } }, createdBy: { select: { username: true } } },
  });

  // Resolve each movement's source document number (sale/purchase/return) in one query per type.
  const idsByType = new Map<string, number[]>();
  for (const m of movements) {
    if (m.referenceType && m.referenceId != null) {
      idsByType.set(m.referenceType, [...(idsByType.get(m.referenceType) ?? []), m.referenceId]);
    }
  }
  const [sales, purchases, saleReturns, purchaseReturns, adjustments] = await Promise.all([
    db.medicineSale.findMany({ where: { id: { in: idsByType.get("MedicineSale") ?? [] } }, select: { id: true, saleNumber: true } }),
    db.medicinePurchase.findMany({ where: { id: { in: idsByType.get("MedicinePurchase") ?? [] } }, select: { id: true, purchaseNumber: true } }),
    db.medicineSaleReturn.findMany({ where: { id: { in: idsByType.get("MedicineSaleReturn") ?? [] } }, select: { id: true, returnNumber: true } }),
    db.medicinePurchaseReturn.findMany({ where: { id: { in: idsByType.get("MedicinePurchaseReturn") ?? [] } }, select: { id: true, returnNumber: true } }),
    db.medicineStockAdjustment.findMany({ where: { id: { in: idsByType.get("MedicineStockAdjustment") ?? [] } }, select: { id: true, type: true } }),
  ]);
  const refLabel = new Map<string, string>([
    ...sales.map((s) => [`MedicineSale:${s.id}`, s.saleNumber] as const),
    ...purchases.map((p) => [`MedicinePurchase:${p.id}`, p.purchaseNumber] as const),
    ...saleReturns.map((r) => [`MedicineSaleReturn:${r.id}`, r.returnNumber] as const),
    ...purchaseReturns.map((r) => [`MedicinePurchaseReturn:${r.id}`, r.returnNumber] as const),
    ...adjustments.map((a) => [`MedicineStockAdjustment:${a.id}`, a.type.replaceAll("_", " ")] as const),
  ]);

  return NextResponse.json({
    medicine: {
      id: medicine.id,
      name: medicine.name,
      unit: medicine.unit,
      currentStock: medicine.batches.reduce((sum, b) => sum + Number(b.quantityRemaining), 0),
    },
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      // Signed change in stock. A quarantined sale return logs its quantity but leaves stock unchanged (0).
      change: Number(m.afterQuantity) - Number(m.beforeQuantity),
      quantity: Number(m.quantity),
      beforeQuantity: Number(m.beforeQuantity),
      afterQuantity: Number(m.afterQuantity),
      batchNumber: m.batch.batchNumber,
      expiryDate: m.batch.expiryDate,
      reference: m.referenceType && m.referenceId != null ? refLabel.get(`${m.referenceType}:${m.referenceId}`) ?? null : null,
      notes: m.notes,
      createdBy: m.createdBy.username,
      createdAt: m.createdAt,
    })),
  });
}
