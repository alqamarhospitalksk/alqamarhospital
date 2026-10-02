import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const items = await db.medicineItem.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { batches: { include: { purchase: { include: { supplier: true } } } } },
  });

  const now = new Date();
  const rows = items.flatMap((item) => {
    // Expired stock can't be sold, so it doesn't count toward what's on hand for reordering.
    const sellable = item.batches
      .filter((b) => Number(b.quantityRemaining) > 0 && b.expiryDate >= now)
      .reduce((sum, b) => sum + Number(b.quantityRemaining), 0);
    const reorderLevel = Number(item.reorderLevel);
    const neverStocked = item.batches.length === 0;
    if (!neverStocked && sellable > reorderLevel) return [];

    const lastBatch = item.batches.slice().sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
    // Top the stock back up to twice the Low Stock level. With no level set there's no basis
    // for a suggestion, so it's left for the user to decide.
    const suggestedQuantity = reorderLevel > 0 ? Math.max(reorderLevel * 2 - sellable, 0) : null;
    const lastUnitCost = lastBatch ? Number(lastBatch.purchasePrice) : null;
    return [{
      medicineId: item.id,
      name: item.name,
      unit: item.unit,
      currentStock: sellable,
      reorderLevel,
      neverStocked,
      suggestedQuantity,
      lastSupplierName: lastBatch?.purchase.supplier.name ?? null,
      lastUnitCost,
      estimatedCost: suggestedQuantity != null && lastUnitCost != null ? suggestedQuantity * lastUnitCost : null,
    }];
  });

  return NextResponse.json({ items: rows });
}
