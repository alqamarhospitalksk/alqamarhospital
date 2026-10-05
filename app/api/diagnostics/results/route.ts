import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";
import { serializeResultItem } from "../../../../lib/lab-catalog";

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
        orderBy: { id: "asc" },
        include: {
          resultUploadedBy: { select: { username: true } },
          resultValues: { orderBy: { sortOrder: "asc" } },
        },
      },
      payments: { select: { amount: true, method: true, status: true } },
    },
  });

  return NextResponse.json({
    receipts: receipts
      .filter((r) => r.patient != null && r.doctor != null)
      .map((r) => {
        const items = r.items.map((item) => ({
          ...serializeResultItem(item),
          price: money(item.priceAtSale),
          resultUploadedBy: item.resultUploadedBy?.username ?? null,
        }));
        const resultStatus = items.length > 0 && items.every((i) => i.done) ? "DONE" : "PENDING";
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
          patient: { name: r.patient!.name, mrNumber: r.patient!.mrNumber, gender: r.patient!.gender },
          doctor: { name: r.doctor!.name },
          items,
          payments: r.payments.map((p) => ({ amount: money(p.amount), method: p.method, status: p.status })),
        };
      }),
  });
}
