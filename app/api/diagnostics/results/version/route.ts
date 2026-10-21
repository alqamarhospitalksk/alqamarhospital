import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { roleError } from "../../../../../lib/roles";
import { db } from "../../../../../lib/db";

// A cheap fingerprint of the test-results lists, polled by the Results and Lab screens every few
// seconds. They reload the full list (hundreds of receipts with every result value) only when this
// changes, instead of on every poll. It moves when a receipt is added, cancelled or printed, or a
// result is saved (saving always stamps resultUploadedAt).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "LAB"]);
  if (denied) return denied;

  const [byStatus, items] = await Promise.all([
    db.diagnosticReceipt.groupBy({ by: ["status"], _count: { _all: true }, _max: { id: true, printedAt: true } }),
    db.diagnosticReceiptItem.aggregate({ _max: { resultUploadedAt: true }, _count: { resultUploadedAt: true } }),
  ]);
  const receipts = byStatus
    .sort((a, b) => a.status.localeCompare(b.status))
    .map((row) => `${row.status}:${row._count._all}:${row._max.id ?? 0}:${row._max.printedAt?.getTime() ?? 0}`)
    .join(",");
  const version = `${receipts}|${items._count.resultUploadedAt}:${items._max.resultUploadedAt?.getTime() ?? 0}`;

  return NextResponse.json({ version });
}
