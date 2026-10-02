import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { roleError } from "../../../../../lib/roles";
import { db } from "../../../../../lib/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "LAB"]);
  if (denied) return denied;

  const { id } = await context.params;
  const receiptId = Number(id);
  const body = await request.json().catch(() => null);
  const result = typeof body?.result === "string" ? body.result.trim() : "";
  if (!Number.isInteger(receiptId) || !result) return NextResponse.json({ error: "A result is required." }, { status: 400 });

  const receipt = await db.diagnosticReceipt.update({ where: { id: receiptId }, data: { result } });
  await db.auditLog.create({ data: { action: "UPDATE", entity: "DiagnosticReceipt", entityId: String(receipt.id), userId: user.id, afterJson: JSON.stringify({ resultAdded: true }) } });
  return NextResponse.json({ receipt: { id: receipt.id, result: receipt.result } });
}
