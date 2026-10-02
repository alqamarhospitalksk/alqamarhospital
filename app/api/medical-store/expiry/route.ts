import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

// Whole calendar days between today and a `@db.Date` expiry (stored as UTC midnight), so the
// count never rounds a day off. Negative = already expired.
function daysUntil(expiry: Date) {
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expiryUTC = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  return Math.round((expiryUTC - todayUTC) / (24 * 60 * 60 * 1000));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const batches = await db.medicineBatch.findMany({
    where: { quantityRemaining: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
    include: { medicineItem: true, purchase: { include: { supplier: true } } },
  });

  return NextResponse.json({
    batches: batches.map((b) => ({
      batchId: b.id,
      medicineName: b.medicineItem.name,
      unit: b.medicineItem.unit,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      daysLeft: daysUntil(b.expiryDate),
      quantity: Number(b.quantityRemaining),
      costValue: Number(b.quantityRemaining) * Number(b.purchasePrice),
      supplierId: b.purchase.supplierId,
      supplierName: b.purchase.supplier.name,
    })),
  });
}
