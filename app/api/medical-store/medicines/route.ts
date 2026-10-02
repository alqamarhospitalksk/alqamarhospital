import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { packagingNameProblem, parsePackagingLevels, withCumulativeFactors } from "../../../../lib/medical-store-packaging";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const categories = ["TABLET", "SYRUP", "INJECTION", "CAPSULE", "OINTMENT", "OTHER"];
const units = ["STRIP", "BOTTLE", "BOX", "PIECE", "VIAL"];

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
    include: { batches: true, packagingLevels: true },
  });

  const now = new Date();
  // A real calendar month, not a fixed 30-day window — 31-day months would otherwise
  // fall a day short, and February would run two days long.
  const soon = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  return NextResponse.json({
    items: items.map((item) => {
      const activeBatches = item.batches.filter((b) => Number(b.quantityRemaining) > 0);
      const totalQuantity = activeBatches.reduce((sum, b) => sum + Number(b.quantityRemaining), 0);
      const nearestExpiry = activeBatches
        .map((b) => b.expiryDate)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      const lastBatch = item.batches.slice().sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
      const lastPurchaseUnitsPerPack = lastBatch ? Number(lastBatch.unitsPerPack || 1) : null;
      const lastPurchaseCostPerPack = lastBatch ? Number(lastBatch.purchasePrice) * (lastPurchaseUnitsPerPack ?? 1) : null;
      const packagingLevels = withCumulativeFactors(
        item.packagingLevels.map((l) => ({ level: l.level, name: l.name, unitsInLevel: Number(l.unitsInLevel) }))
      );
      return {
        id: item.id,
        name: item.name,
        genericName: item.genericName,
        category: item.category,
        unit: item.unit,
        packagingLevels,
        salePrice: item.salePrice.toString(),
        reorderLevel: item.reorderLevel.toString(),
        active: item.active,
        totalQuantity,
        nearestExpiry,
        // Never purchased (just added to the catalog) isn't "low stock" — there's nothing to run low on yet.
        neverStocked: item.batches.length === 0,
        lowStock: item.batches.length > 0 && totalQuantity <= Number(item.reorderLevel),
        expired: nearestExpiry != null && nearestExpiry < now,
        expiringSoon: nearestExpiry != null && nearestExpiry >= now && nearestExpiry <= soon,
        lastPurchaseCostPerPack: lastPurchaseCostPerPack != null ? Number(lastPurchaseCostPerPack.toFixed(2)) : null,
        lastPurchaseUnitsPerPack: lastPurchaseUnitsPerPack,
        // Sellable stock in the order a sale draws it (earliest expiry first, expired skipped) —
        // lets the Sell page show the real cost of a line before it's recorded.
        sellableBatches: activeBatches
          .filter((b) => b.expiryDate >= now)
          .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime())
          .map((b) => ({ quantity: Number(b.quantityRemaining), unitCost: Number(b.purchasePrice) })),
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const genericName = text(body?.genericName) || null;
  const category = text(body?.category).toUpperCase();
  const unit = text(body?.unit).toUpperCase();
  const salePrice = Number(body?.salePrice ?? 0);
  const reorderLevel = Number(body?.reorderLevel ?? 0);
  const packagingLevels = parsePackagingLevels(body?.packagingLevels ?? []);

  if (
    !name ||
    !categories.includes(category) ||
    !units.includes(unit) ||
    !Number.isFinite(salePrice) || salePrice < 0 ||
    !Number.isFinite(reorderLevel) || reorderLevel < 0 ||
    packagingLevels === null
  ) {
    return NextResponse.json({ error: "Enter a valid medicine name, category, unit, price, reorder level, and packaging levels." }, { status: 400 });
  }
  const namingProblem = packagingNameProblem(packagingLevels, unit);
  if (namingProblem) return NextResponse.json({ error: namingProblem }, { status: 400 });

  try {
    const item = await db.$transaction(async (transaction) => {
      const created = await transaction.medicineItem.create({ data: { name, genericName, category, unit, salePrice, reorderLevel } });
      if (packagingLevels.length > 0) {
        await transaction.medicinePackagingLevel.createMany({
          data: packagingLevels.map((l, index) => ({ medicineItemId: created.id, level: index + 1, name: l.name, unitsInLevel: l.unitsInLevel })),
        });
      }
      return created;
    });
    await db.auditLog.create({ data: { action: "CREATE", entity: "MedicineItem", entityId: String(item.id), userId: user.id, afterJson: JSON.stringify({ name, category, salePrice }) } });
    return NextResponse.json({
      item: {
        ...item,
        salePrice: item.salePrice.toString(),
        reorderLevel: item.reorderLevel.toString(),
        packagingLevels: withCumulativeFactors(packagingLevels.map((l, index) => ({ level: index + 1, name: l.name, unitsInLevel: l.unitsInLevel }))),
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A medicine with this name and category already exists." }, { status: 409 });
  }
}
