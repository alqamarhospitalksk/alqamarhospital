import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { roleError } from "../../../../../lib/roles";
import { db } from "../../../../../lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;

  const { id } = await context.params;
  const receiptId = Number(id);
  if (!Number.isInteger(receiptId)) return NextResponse.json({ error: "Invalid receipt ID." }, { status: 400 });

  const existing = await db.diagnosticReceipt.findUnique({ where: { id: receiptId } });
  if (!existing) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  const receipt = await db.diagnosticReceipt.update({
    where: { id: receiptId },
    data: { printedAt: new Date(), printedById: user.id },
  });

  return NextResponse.json({ receipt: { id: receipt.id, printedAt: receipt.printedAt } });
}
