import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { runTransaction } from "../../../../lib/transaction";
import { withCumulativeFactors } from "../../../../lib/medical-store-packaging";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

type PurchaseLine = {
  lineTotalCost: number;
  medicineItemId: number;
  batchNumber: string | null;
  levelName: string;
  quantityAtLevel: number;
  cumulativeFactor: number;
  quantityReceived: number;
  purchasePrice: number;
  salePriceOverride: number | null;
  expiryDate: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const purchases = await db.medicinePurchase.findMany({
    orderBy: { id: "desc" },
    take: 50,
    include: { supplier: true, batches: { include: { medicineItem: true } }, createdBy: { select: { username: true } } },
  });

  return NextResponse.json({
    purchases: purchases.map((p) => ({
      id: p.id,
      purchaseNumber: p.purchaseNumber,
      supplier: p.supplier.name,
      totalCost: p.totalCost.toString(),
      createdAt: p.createdAt,
      createdBy: p.createdBy.username,
      supplierId: p.supplierId,
      batches: p.batches.map((b) => ({
        id: b.id,
        medicineName: b.medicineItem.name,
        batchNumber: b.batchNumber,
        packsReceived: b.packsReceived ? b.packsReceived.toString() : null,
        unitsPerPack: b.unitsPerPack.toString(),
        receivedLevelName: b.receivedLevelName,
        quantityReceived: b.quantityReceived.toString(),
        quantityRemaining: b.quantityRemaining.toString(),
        purchasePrice: b.purchasePrice.toString(),
        expiryDate: b.expiryDate,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const supplierId = Number(body?.supplierId);
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];

  // Each line specifies which packaging level was received (e.g. "CARTON") and how many of that
  // level, plus the total cost for that quantity. We resolve the level's cumulative factor back
  // to individual base units, since that's what stock/FEFO/sales operate on.
  const medicineCache = new Map<number, { unit: string; levels: { name: string; cumulativeUnits: number }[] } | null>();

  async function resolveMedicine(medicineItemId: number) {
    if (!medicineCache.has(medicineItemId)) {
      const medicine = await db.medicineItem.findUnique({ where: { id: medicineItemId }, include: { packagingLevels: true } });
      if (!medicine) {
        medicineCache.set(medicineItemId, null);
      } else {
        const levels = withCumulativeFactors(medicine.packagingLevels.map((l) => ({ level: l.level, name: l.name, unitsInLevel: Number(l.unitsInLevel) })));
        medicineCache.set(medicineItemId, { unit: medicine.unit, levels: levels.map((l) => ({ name: l.name, cumulativeUnits: l.cumulativeUnits })) });
      }
    }
    return medicineCache.get(medicineItemId) ?? null;
  }

  const lines: PurchaseLine[] = [];
  for (const raw of rawLines) {
    const record = raw as Record<string, unknown>;
    const medicineItemId = Number(record?.medicineItemId);
    const expiryDate = text(record?.expiryDate);
    const batchNumber = text(record?.batchNumber) || null;
    const salePriceOverrideRaw = record?.salePriceOverride;
    const salePriceOverride = salePriceOverrideRaw !== undefined && salePriceOverrideRaw !== "" ? Number(salePriceOverrideRaw) : null;

    const levelName = text(record?.levelName).toUpperCase();
    const quantityAtLevel = Number(record?.quantityAtLevel);
    const totalCost = Number(record?.totalCost);

    if (!Number.isInteger(medicineItemId) || !expiryDate || Number.isNaN(Date.parse(expiryDate))) {
      return NextResponse.json({ error: "Each purchase line needs a medicine and a valid expiry date." }, { status: 400 });
    }
    if (!levelName || !Number.isFinite(quantityAtLevel) || quantityAtLevel <= 0) {
      return NextResponse.json({ error: "Each purchase line needs a packaging level and a quantity greater than zero." }, { status: 400 });
    }
    if (!Number.isFinite(totalCost) || totalCost < 0) {
      return NextResponse.json({ error: "Enter a valid total cost for each purchase line." }, { status: 400 });
    }

    const medicine = await resolveMedicine(medicineItemId);
    if (!medicine) return NextResponse.json({ error: "One of the selected medicines was not found." }, { status: 400 });

    const cumulativeFactor = levelName === medicine.unit
      ? 1
      : medicine.levels.find((l) => l.name === levelName)?.cumulativeUnits;
    if (!cumulativeFactor) {
      return NextResponse.json({ error: `"${levelName}" is not a configured packaging level for this medicine.` }, { status: 400 });
    }

    const quantityReceived = quantityAtLevel * cumulativeFactor;
    const purchasePrice = totalCost / quantityReceived;

    lines.push({ medicineItemId, batchNumber, levelName, quantityAtLevel, cumulativeFactor, quantityReceived, purchasePrice, lineTotalCost: totalCost, salePriceOverride, expiryDate });
  }

  if (!Number.isInteger(supplierId) || lines.length === 0) {
    return NextResponse.json({ error: "Select a supplier and add at least one valid purchase line." }, { status: 400 });
  }

  try {
    const result = await runTransaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new Error("Supplier not found.");

      const now = new Date();
      const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const sequenceKey = `MEDPURCHASE:${dateKey}`;
      const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
      const purchaseNumber = `PUR-${dateKey}-${String(sequence.nextValue - 1).padStart(4, "0")}`;

      // Sum of what was actually entered per line — not quantity x a rounded unit cost, which can be off by a few paisa.
      const totalCost = Math.round(lines.reduce((sum, l) => sum + l.lineTotalCost, 0) * 100) / 100;
      const purchase = await transaction.medicinePurchase.create({
        data: { purchaseNumber, supplierId, totalCost, createdById: user.id },
      });

      for (const line of lines) {
        const batch = await transaction.medicineBatch.create({
          data: {
            medicineItemId: line.medicineItemId,
            purchaseId: purchase.id,
            batchNumber: line.batchNumber,
            packsReceived: line.quantityAtLevel,
            unitsPerPack: line.cumulativeFactor,
            receivedLevelName: line.levelName,
            quantityReceived: line.quantityReceived,
            quantityRemaining: line.quantityReceived,
            purchasePrice: line.purchasePrice,
            salePriceOverride: line.salePriceOverride,
            expiryDate: new Date(line.expiryDate),
          },
        });
        await transaction.medicineStockTransaction.create({
          data: {
            medicineItemId: line.medicineItemId,
            batchId: batch.id,
            type: "PURCHASE",
            quantity: line.quantityReceived,
            beforeQuantity: 0,
            afterQuantity: line.quantityReceived,
            referenceType: "MedicinePurchase",
            referenceId: purchase.id,
            createdById: user.id,
          },
        });
      }

      return purchase;
    });

    await db.auditLog.create({ data: { action: "CREATE", entity: "MedicinePurchase", entityId: String(result.id), userId: user.id, afterJson: JSON.stringify({ purchaseNumber: result.purchaseNumber, lines: lines.length }) } });
    return NextResponse.json({ purchase: { id: result.id, purchaseNumber: result.purchaseNumber, totalCost: result.totalCost.toString() } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the purchase." }, { status: 409 });
  }
}
