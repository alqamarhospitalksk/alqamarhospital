import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { packagingNameProblem, parsePackagingLevels, withCumulativeFactors } from "../../../../../lib/medical-store-packaging";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const categories = ["TABLET", "SYRUP", "INJECTION", "CAPSULE", "OINTMENT", "OTHER"];
const units = ["STRIP", "BOTTLE", "BOX", "PIECE", "VIAL"];

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const itemId = Number((await context.params).id);
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "Invalid medicine ID." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const name = body?.name === undefined ? undefined : text(body.name);
  const genericName = body?.genericName === undefined ? undefined : (text(body.genericName) || null);
  const category = body?.category === undefined ? undefined : text(body.category).toUpperCase();
  const unit = body?.unit === undefined ? undefined : text(body.unit).toUpperCase();
  const salePrice = body?.salePrice === undefined ? undefined : Number(body.salePrice);
  const reorderLevel = body?.reorderLevel === undefined ? undefined : Number(body.reorderLevel);
  const active = typeof body?.active === "boolean" ? body.active : undefined;
  const packagingLevels = body?.packagingLevels === undefined ? undefined : parsePackagingLevels(body.packagingLevels);

  if (
    (name !== undefined && !name) ||
    (category !== undefined && !categories.includes(category)) ||
    (unit !== undefined && !units.includes(unit)) ||
    [salePrice, reorderLevel].some((v) => v !== undefined && (!Number.isFinite(v) || v < 0)) ||
    (packagingLevels !== undefined && packagingLevels === null)
  ) {
    return NextResponse.json({ error: "Enter valid medicine details." }, { status: 400 });
  }
  // Check level names against the base unit being saved (or the existing one, if unchanged).
  if (packagingLevels || unit !== undefined) {
    const existing = await db.medicineItem.findUnique({ where: { id: itemId }, include: { packagingLevels: true } });
    if (!existing) return NextResponse.json({ error: "Medicine not found." }, { status: 404 });
    const levelsToCheck = packagingLevels ?? existing.packagingLevels.map((l) => ({ name: l.name, unitsInLevel: Number(l.unitsInLevel) }));
    const namingProblem = packagingNameProblem(levelsToCheck, unit ?? existing.unit);
    if (namingProblem) return NextResponse.json({ error: namingProblem }, { status: 400 });
  }

  try {
    const item = await db.$transaction(async (transaction) => {
      const updated = await transaction.medicineItem.update({
        where: { id: itemId },
        data: {
          ...(name === undefined ? {} : { name }),
          ...(genericName === undefined ? {} : { genericName }),
          ...(category === undefined ? {} : { category }),
          ...(unit === undefined ? {} : { unit }),
          ...(salePrice === undefined ? {} : { salePrice }),
          ...(reorderLevel === undefined ? {} : { reorderLevel }),
          ...(active === undefined ? {} : { active }),
        },
      });
      if (packagingLevels !== undefined && packagingLevels !== null) {
        await transaction.medicinePackagingLevel.deleteMany({ where: { medicineItemId: itemId } });
        if (packagingLevels.length > 0) {
          await transaction.medicinePackagingLevel.createMany({
            data: packagingLevels.map((l, index) => ({ medicineItemId: itemId, level: index + 1, name: l.name, unitsInLevel: l.unitsInLevel })),
          });
        }
      }
      return updated;
    });
    const levels = await db.medicinePackagingLevel.findMany({ where: { medicineItemId: itemId } });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "MedicineItem", entityId: String(item.id), userId: user.id, afterJson: JSON.stringify({ name: item.name }) } });
    return NextResponse.json({
      item: {
        ...item,
        salePrice: item.salePrice.toString(),
        reorderLevel: item.reorderLevel.toString(),
        packagingLevels: withCumulativeFactors(levels.map((l) => ({ level: l.level, name: l.name, unitsInLevel: Number(l.unitsInLevel) }))),
      },
    });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "P2002") return NextResponse.json({ error: "A medicine with this name and category already exists." }, { status: 409 });
    return NextResponse.json({ error: "Unable to update medicine." }, { status: 404 });
  }
}
