import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // A real calendar month, not a fixed 30-day window — 31-day months would otherwise
  // fall a day short, and February would run two days long.
  const soon = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  // Bounded to a year so the Yearly chart view has full coverage without pulling the
  // store's entire sales history on every dashboard load.
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const [items, todaySales, salesHistory, refundsHistory] = await Promise.all([
    db.medicineItem.findMany({
      where: { active: true },
      include: { batches: { where: { quantityRemaining: { gt: 0 } } }, _count: { select: { batches: true } } },
    }),
    db.medicineSale.findMany({
      where: { createdAt: { gte: startOfToday }, status: "PAID" },
      select: { total: true },
    }),
    db.medicineSale.findMany({
      where: { createdAt: { gte: yearAgo }, status: "PAID" },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: "asc" },
    }),
    // Money handed back to customers — it has to come off the revenue figures.
    db.medicineSaleReturn.findMany({
      where: { createdAt: { gte: yearAgo } },
      select: { createdAt: true, totalRefund: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Never-purchased medicines (just added to the catalog) have no stock to be "low" on, so
  // they're left out of the Low Stock card, the stock pie and the Low Stock chart.
  const rows = items.filter((item) => item._count.batches > 0).map((item) => {
    const totalQuantity = item.batches.reduce((sum, b) => sum + Number(b.quantityRemaining), 0);
    const nearestExpiry = item.batches.map((b) => b.expiryDate).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      totalQuantity,
      reorderLevel: Number(item.reorderLevel),
      nearestExpiry,
      lowStock: totalQuantity <= Number(item.reorderLevel),
      expired: nearestExpiry != null && nearestExpiry < now,
      expiringSoon: nearestExpiry != null && nearestExpiry >= now && nearestExpiry <= soon,
    };
  });

  const todayRefunds = refundsHistory.filter((r) => r.createdAt >= startOfToday).reduce((sum, r) => sum + Number(r.totalRefund), 0);
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total), 0) - todayRefunds;

  // Each medicine counted in exactly one bucket — worst status wins — so the pie
  // chart on the dashboard adds up to the full catalog instead of double-counting
  // an item that's e.g. both low stock and expiring soon.
  const stockStatusCounts = rows.reduce(
    (acc, r) => {
      if (r.expired) acc.expired += 1;
      else if (r.expiringSoon) acc.expiringSoon += 1;
      else if (r.lowStock) acc.lowStock += 1;
      else acc.ok += 1;
      return acc;
    },
    { ok: 0, lowStock: 0, expiringSoon: 0, expired: 0 }
  );

  return NextResponse.json({
    todayRevenue,
    todayRefunds,
    todaySalesCount: todaySales.length,
    lowStock: rows.filter((r) => r.lowStock),
    expiringSoon: rows.filter((r) => r.expiringSoon),
    expired: rows.filter((r) => r.expired),
    stockStatusCounts,
    salesHistory: salesHistory.map((s) => ({ createdAt: s.createdAt, total: Number(s.total) })),
    refundsHistory: refundsHistory.map((r) => ({ createdAt: r.createdAt, total: Number(r.totalRefund) })),
  });
}
