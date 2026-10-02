import { db } from "./db";

// Most recent SALARY-category expense per employee — shared by /api/employees and
// /api/finance so both compute the "payment cycle" status (lib/payment-cycle.ts)
// from the exact same data instead of two slightly different queries drifting apart.
export type LastSalaryPayout = { paidOn: Date; amount: number };

export async function getLastSalaryPayoutMap(employeeIds: number[]): Promise<Map<number, LastSalaryPayout>> {
  if (employeeIds.length === 0) return new Map();
  const salaryPayouts = await db.expense.findMany({
    where: { category: "SALARY", employeeId: { in: employeeIds } },
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
    select: { employeeId: true, expenseDate: true, amount: true },
  });
  const lastSalaryPayoutByEmployee = new Map<number, LastSalaryPayout>();
  for (const payout of salaryPayouts) {
    if (payout.employeeId !== null && !lastSalaryPayoutByEmployee.has(payout.employeeId)) {
      lastSalaryPayoutByEmployee.set(payout.employeeId, { paidOn: payout.expenseDate, amount: Number(payout.amount) });
    }
  }
  return lastSalaryPayoutByEmployee;
}
