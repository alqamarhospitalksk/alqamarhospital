import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../../lib/auth";
import { db } from "../../../../../../lib/db";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const medicineItemId = Number((await context.params).id);
  if (!Number.isInteger(medicineItemId)) return NextResponse.json({ error: "Invalid medicine ID." }, { status: 400 });

  const batches = await db.medicineBatch.findMany({
    where: { medicineItemId, quantityRemaining: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
  });

  return NextResponse.json({
    batches: batches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      quantityRemaining: b.quantityRemaining.toString(),
      expiryDate: b.expiryDate,
      purchasePrice: b.purchasePrice.toString(),
    })),
  });
}
