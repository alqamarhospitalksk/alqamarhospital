import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";

function money(value: { toString(): string }) {
  return value.toString();
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT", "LAB"]);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const moduleFilter = params.get("module")?.trim().toUpperCase();

  const receipts = await db.diagnosticReceipt.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(moduleFilter ? { module: moduleFilter } : {}),
    },
    orderBy: { id: "desc" },
    take: 200,
    include: {
      patient: true,
      doctor: true,
      opdVisit: true,
      printedBy: { select: { username: true } },
      items: {
        include: { resultUploadedBy: { select: { username: true } } },
      },
      payments: { select: { amount: true, method: true, status: true } },
    },
  });

  return NextResponse.json({
    receipts: receipts
      .filter((r) => r.patient != null && r.doctor != null)
      .map((r) => {
        const items = r.items.map((item) => ({
          id: item.id,
          name: item.nameAtSale,
          price: money(item.priceAtSale),
          result: item.result,
          resultFileName: item.resultFileName,
          hasResultFile: Boolean(item.resultFileDataUrl),
          resultUploadedAt: item.resultUploadedAt,
          resultUploadedBy: item.resultUploadedBy?.username ?? null,
        }));
        const resultStatus =
          items.length > 0 && items.every((i) => i.result || i.hasResultFile) ? "DONE" : "PENDING";
        return {
          id: r.id,
          receiptNumber: r.receiptNumber,
          module: r.module,
          moduleToken: r.moduleToken,
          total: money(r.total),
          status: r.status,
          resultStatus,
          createdAt: r.createdAt,
          opdNumber: r.opdVisit?.opdNumber ?? null,
          printedAt: r.printedAt,
          printedBy: r.printedBy?.username ?? null,
          patient: { name: r.patient!.name, mrNumber: r.patient!.mrNumber },
          doctor: { name: r.doctor!.name },
          items,
          payments: r.payments.map((p) => ({ amount: money(p.amount), method: p.method, status: p.status })),
        };
      }),
  });
}
