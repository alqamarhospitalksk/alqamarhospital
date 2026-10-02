import { db } from "./db";

// Money handed back to medicine-store customers (sale returns). The sale itself was counted in the
// gross when it was paid, so the refund has to come back out of the gross on the day it is paid —
// otherwise returned medicines would keep showing as income.
export async function storeRefundsForPeriod(since: Date, until: Date) {
  const returns = await db.medicineSaleReturn.findMany({
    where: { createdAt: { gte: since, lt: until } },
    orderBy: { createdAt: "asc" },
    include: { sale: { include: { patient: true } } },
  });
  const rows = returns.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    amount: Number(r.totalRefund),
    returnNumber: r.returnNumber,
    customer: r.sale.patient?.name ?? r.sale.customerName ?? "Walk-in",
    mrNumber: r.sale.patient?.mrNumber ?? "",
  }));
  return { total: rows.reduce((sum, r) => sum + r.amount, 0), rows };
}
