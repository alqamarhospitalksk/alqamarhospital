import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { toDateColumnBoundary } from "../../../../lib/date-range";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const [suppliers, payments] = await Promise.all([
    db.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        purchases: { select: { totalCost: true } },
        purchaseReturns: { select: { totalAmount: true, refundMode: true } },
        payments: { select: { amount: true } },
      },
    }),
    db.supplierPayment.findMany({
      orderBy: { id: "desc" },
      take: 100,
      include: { supplier: { select: { name: true } }, createdBy: { select: { username: true } } },
    }),
  ]);

  return NextResponse.json({
    suppliers: suppliers.map((s) => {
      const purchased = s.purchases.reduce((sum, p) => sum + Number(p.totalCost), 0);
      const paid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      // A CASH return was refunded in money, so it doesn't change what we owe; a CREDIT return does.
      const creditReturns = s.purchaseReturns.filter((r) => r.refundMode === "CREDIT").reduce((sum, r) => sum + Number(r.totalAmount), 0);
      return {
        id: s.id,
        name: s.name,
        active: s.active,
        purchased,
        paid,
        creditReturns,
        balance: purchased - paid - creditReturns,
      };
    }),
    payments: payments.map((p) => ({
      id: p.id,
      supplierName: p.supplier.name,
      amount: p.amount.toString(),
      method: p.method,
      paidOn: p.paidOn,
      note: p.note,
      createdBy: p.createdBy.username,
      createdAt: p.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const supplierId = Number(body?.supplierId);
  const amount = Number(body?.amount);
  const method = text(body?.method).toUpperCase() || "CASH";
  const paidOnRaw = text(body?.paidOn);
  const note = text(body?.note) || null;

  if (!Number.isInteger(supplierId)) return NextResponse.json({ error: "Select a supplier." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
  if (!methods.includes(method)) return NextResponse.json({ error: "Select a valid payment method." }, { status: 400 });
  const paidOnLocal = new Date(`${paidOnRaw}T00:00:00`);
  if (!paidOnRaw || Number.isNaN(paidOnLocal.getTime())) return NextResponse.json({ error: "Enter a valid payment date." }, { status: 400 });
  if (paidOnLocal > new Date()) return NextResponse.json({ error: "The payment date can't be in the future." }, { status: 400 });
  const paidOn = toDateColumnBoundary(paidOnLocal);

  try {
    const payment = await db.$transaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new Error("Supplier not found.");
      const created = await transaction.supplierPayment.create({
        data: { supplierId, amount, method: method as "CASH", paidOn, note, createdById: user.id },
      });
      // Paying a supplier is money leaving the hospital — record it as an expense on the day it
      // was paid, so it counts toward Total Expenses / Net Revenue like every other cost.
      await transaction.expense.create({
        data: {
          category: "SUPPLIER_PAYMENT",
          amount,
          method: method as "CASH",
          expenseDate: paidOn,
          note: `Payment to ${supplier.name}${note ? ` — ${note}` : ""}`,
          createdById: user.id,
        },
      });
      return created;
    });

    await db.auditLog.create({ data: { action: "CREATE", entity: "SupplierPayment", entityId: String(payment.id), userId: user.id, afterJson: JSON.stringify({ supplierId, amount, method }) } });
    return NextResponse.json({ payment: { id: payment.id, amount: payment.amount.toString() } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record the payment." }, { status: 409 });
  }
}
