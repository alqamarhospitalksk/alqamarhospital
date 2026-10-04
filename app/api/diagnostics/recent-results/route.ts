import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";

// Lightweight feed of the most recently-uploaded test results, polled by the
// operator's workspace shell to surface a toast when the Lab finishes a test.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "LAB"]);
  if (denied) return denied;

  const items = await db.diagnosticReceiptItem.findMany({
    where: { resultUploadedAt: { not: null }, receipt: { module: "LABORATORY" } },
    orderBy: { resultUploadedAt: "desc" },
    take: 20,
    select: {
      id: true,
      nameAtSale: true,
      resultUploadedAt: true,
      receipt: { select: { receiptNumber: true, module: true, patient: { select: { name: true, mrNumber: true } } } },
    },
  });

  return NextResponse.json({
    results: items
      .filter((item) => item.receipt?.patient != null)
      .map((item) => ({
        id: item.id,
        testName: item.nameAtSale,
        resultUploadedAt: item.resultUploadedAt,
        receiptNumber: item.receipt.receiptNumber,
        module: item.receipt.module,
        patient: { name: item.receipt.patient!.name, mrNumber: item.receipt.patient!.mrNumber },
      })),
  });
}
