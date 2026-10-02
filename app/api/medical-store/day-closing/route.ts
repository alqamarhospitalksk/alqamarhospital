import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { toDateColumnBoundary } from "../../../../lib/date-range";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

function parseDay(value: string | null) {
  const day = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(day.getTime())) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate());
}

// Money that went through the store counter on one local calendar day.
async function daySummary(dayStart: Date) {
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  const [payments, saleReturns] = await Promise.all([
    db.payment.findMany({
      where: { medicineSaleId: { not: null }, status: "PAID", createdAt: { gte: dayStart, lt: dayEnd } },
      select: { amount: true, method: true },
    }),
    db.medicineSaleReturn.findMany({ where: { createdAt: { gte: dayStart, lt: dayEnd } }, select: { totalRefund: true } }),
  ]);
  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
  const cashSales = byMethod.CASH ?? 0;
  // Sale refunds are handed back from the counter drawer in cash.
  const cashRefunds = saleReturns.reduce((sum, r) => sum + Number(r.totalRefund), 0);
  return {
    cashSales,
    cashRefunds,
    expectedCash: cashSales - cashRefunds,
    otherMethods: Object.entries(byMethod).filter(([method]) => method !== "CASH").map(([method, amount]) => ({ method, amount })),
    salesCount: payments.length,
    refundsCount: saleReturns.length,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const day = parseDay(new URL(request.url).searchParams.get("date"));
  if (!day) return NextResponse.json({ error: "Enter a valid date." }, { status: 400 });

  const [summary, existing, recent] = await Promise.all([
    daySummary(day),
    db.medicineDayClosing.findUnique({ where: { closingDate: toDateColumnBoundary(day) }, include: { closedBy: { select: { username: true } } } }),
    db.medicineDayClosing.findMany({ orderBy: { closingDate: "desc" }, take: 30, include: { closedBy: { select: { username: true } } } }),
  ]);

  const serialize = (c: NonNullable<typeof existing>) => ({
    closingDate: c.closingDate,
    cashSales: Number(c.cashSales),
    cashRefunds: Number(c.cashRefunds),
    expectedCash: Number(c.expectedCash),
    countedCash: Number(c.countedCash),
    difference: Number(c.difference),
    note: c.note,
    closedBy: c.closedBy.username,
    updatedAt: c.updatedAt,
  });

  return NextResponse.json({ summary, closing: existing ? serialize(existing) : null, recent: recent.map(serialize) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const day = parseDay(text(body?.date) || null);
  const countedCash = Number(body?.countedCash);
  const note = text(body?.note) || null;
  if (!day) return NextResponse.json({ error: "Enter a valid date." }, { status: 400 });
  if (day > new Date()) return NextResponse.json({ error: "You can't close a day that hasn't started yet." }, { status: 400 });
  if (!Number.isFinite(countedCash) || countedCash < 0) return NextResponse.json({ error: "Enter the cash you counted (zero or more)." }, { status: 400 });

  // Always recomputed on the server — the figures on screen may be minutes old.
  const summary = await daySummary(day);
  const difference = countedCash - summary.expectedCash;
  const closingDate = toDateColumnBoundary(day);
  const data = { cashSales: summary.cashSales, cashRefunds: summary.cashRefunds, expectedCash: summary.expectedCash, countedCash, difference, note, closedById: user.id };

  const closing = await db.medicineDayClosing.upsert({ where: { closingDate }, create: { closingDate, ...data }, update: data });
  await db.auditLog.create({ data: { action: "CREATE", entity: "MedicineDayClosing", entityId: String(closing.id), userId: user.id, reason: note, afterJson: JSON.stringify({ expectedCash: summary.expectedCash, countedCash, difference }) } });
  return NextResponse.json({ ok: true, expectedCash: summary.expectedCash, countedCash, difference });
}
