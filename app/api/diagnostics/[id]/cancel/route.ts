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
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action.toUpperCase() : "CANCEL";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(receiptId) || !reason) {
    return NextResponse.json({ error: "A valid cancellation or refund reason is required." }, { status: 400 });
  }

  const targetStatus = action === "REFUND" ? "REFUNDED" : "CANCELLED";

  const updated = await db.$transaction(async (transaction) => {
    const existing = await transaction.diagnosticReceipt.findUnique({ where: { id: receiptId } });
    if (!existing) throw new Error("Diagnostic receipt not found.");
    if (existing.status === "CANCELLED" || existing.status === "REFUNDED") {
      throw new Error(`Receipt is already ${existing.status.toLowerCase()}.`);
    }

    const receipt = await transaction.diagnosticReceipt.update({
      where: { id: receiptId },
      data: { status: targetStatus },
    });

    await transaction.payment.updateMany({
      where: { receiptId },
      data: { status: targetStatus, note: reason },
    });

    await transaction.auditLog.create({
      data: {
        action: action === "REFUND" ? "REFUND" : "CANCEL",
        entity: "DiagnosticReceipt",
        entityId: String(receiptId),
        userId: user.id,
        reason,
        afterJson: JSON.stringify({ status: targetStatus, reason }),
      },
    });

    return receipt;
  });

  return NextResponse.json({ receipt: { id: updated.id, receiptNumber: updated.receiptNumber, status: updated.status } });
}
