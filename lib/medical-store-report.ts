import { db } from "./db";
import { toDateColumnBoundary } from "./date-range";

// Shared by the Medical Store Reports page (JSON) and its Excel export, so both always show the same numbers.
export async function buildMedicalStoreReport(fromDate: Date, toDate: Date) {
  // saleDate is a `@db.Date` column — see lib/date-range.ts for why it needs UTC-anchored
  // boundaries instead of the plain local-time fromDate/toDate used for the createdAt
  // (DateTime) queries below.
  const [sales, saleReturns, purchases, purchaseReturns, activeBatches] = await Promise.all([
    db.medicineSale.findMany({
      where: { saleDate: { gte: toDateColumnBoundary(fromDate), lte: toDateColumnBoundary(toDate) } },
      include: { items: { include: { medicineItem: true } } },
    }),
    db.medicineSaleReturn.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate } },
      include: { items: { include: { saleItem: { include: { medicineItem: true } } } } },
    }),
    db.medicinePurchase.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate } },
      include: { supplier: true },
    }),
    db.medicinePurchaseReturn.findMany({ where: { createdAt: { gte: fromDate, lte: toDate } } }),
    db.medicineBatch.findMany({ where: { quantityRemaining: { gt: 0 } } }),
  ]);

  const salesRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
  const salesDiscount = sales.reduce((sum, s) => sum + Number(s.discount), 0);
  const saleReturnsRefund = saleReturns.reduce((sum, r) => sum + Number(r.totalRefund), 0);
  const purchasesCost = purchases.reduce((sum, p) => sum + Number(p.totalCost), 0);
  const purchaseReturnsAmount = purchaseReturns.reduce((sum, r) => sum + Number(r.totalAmount), 0);
  const stockValue = activeBatches.reduce((sum, b) => sum + Number(b.quantityRemaining) * Number(b.purchasePrice), 0);

  const medicineAgg = new Map<string, { quantitySold: number; revenue: number }>();
  const categoryAgg = new Map<string, { quantitySold: number; revenue: number }>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const name = item.medicineItem.name;
      const category = item.medicineItem.category;
      const qty = Number(item.quantity);
      const total = Number(item.total);

      const med = medicineAgg.get(name) ?? { quantitySold: 0, revenue: 0 };
      med.quantitySold += qty;
      med.revenue += total;
      medicineAgg.set(name, med);

      const cat = categoryAgg.get(category) ?? { quantitySold: 0, revenue: 0 };
      cat.quantitySold += qty;
      cat.revenue += total;
      categoryAgg.set(category, cat);
    }
  }

  // Profit uses the purchase price saved on each sale line at the moment of sale
  // (MedicineSaleItem.costPriceAtSale). Lines sold before that was recorded have no cost, so
  // they're left out of profit entirely (both revenue and cost) rather than counted as 100% margin.
  const profitAgg = new Map<string, { quantitySold: number; revenue: number; cost: number }>();
  let linesWithoutCost = 0;
  let revenueWithoutCost = 0;
  for (const sale of sales) {
    for (const item of sale.items) {
      if (item.costPriceAtSale == null) {
        linesWithoutCost += 1;
        revenueWithoutCost += Number(item.total);
        continue;
      }
      const entry = profitAgg.get(item.medicineItem.name) ?? { quantitySold: 0, revenue: 0, cost: 0 };
      entry.quantitySold += Number(item.quantity);
      entry.revenue += Number(item.total);
      entry.cost += Number(item.quantity) * Number(item.costPriceAtSale);
      profitAgg.set(item.medicineItem.name, entry);
    }
  }
  // Returned items give back their revenue and their cost, whatever happened to the stock.
  for (const saleReturn of saleReturns) {
    for (const item of saleReturn.items) {
      if (item.saleItem.costPriceAtSale == null) continue;
      const entry = profitAgg.get(item.saleItem.medicineItem.name) ?? { quantitySold: 0, revenue: 0, cost: 0 };
      entry.quantitySold -= Number(item.quantity);
      entry.revenue -= Number(item.total);
      entry.cost -= Number(item.quantity) * Number(item.saleItem.costPriceAtSale);
      profitAgg.set(item.saleItem.medicineItem.name, entry);
    }
  }
  const profitRevenue = [...profitAgg.values()].reduce((sum, e) => sum + e.revenue, 0);
  const costOfGoodsSold = [...profitAgg.values()].reduce((sum, e) => sum + e.cost, 0);
  // Discounts are given on the whole sale, not per medicine, so they come off the total only.
  const grossProfit = profitRevenue - costOfGoodsSold - salesDiscount;
  const profitByMedicine = [...profitAgg.entries()]
    .map(([medicineName, e]) => ({
      medicineName,
      quantitySold: e.quantitySold,
      revenue: e.revenue,
      cost: e.cost,
      profit: e.revenue - e.cost,
      marginPercent: e.revenue > 0 ? ((e.revenue - e.cost) / e.revenue) * 100 : 0,
    }))
    .filter((e) => e.quantitySold !== 0 || e.revenue !== 0)
    .sort((a, b) => b.profit - a.profit);

  const supplierAgg = new Map<string, { totalCost: number; purchaseCount: number }>();
  for (const purchase of purchases) {
    const name = purchase.supplier.name;
    const entry = supplierAgg.get(name) ?? { totalCost: 0, purchaseCount: 0 };
    entry.totalCost += Number(purchase.totalCost);
    entry.purchaseCount += 1;
    supplierAgg.set(name, entry);
  }

  const topMedicines = [...medicineAgg.entries()]
    .map(([medicineName, v]) => ({ medicineName, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 15);

  const byCategory = [...categoryAgg.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const bySupplier = [...supplierAgg.entries()]
    .map(([supplierName, v]) => ({ supplierName, ...v }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return {
    range: { from: fromDate.toISOString(), to: toDate.toISOString() },
    totals: {
      salesRevenue,
      salesDiscount,
      salesCount: sales.length,
      saleReturnsRefund,
      purchasesCost,
      purchasesCount: purchases.length,
      purchaseReturnsAmount,
      netRevenue: salesRevenue - saleReturnsRefund,
      stockValue,
      costOfGoodsSold,
      grossProfit,
      profitMarginPercent: profitRevenue - salesDiscount > 0 ? (grossProfit / (profitRevenue - salesDiscount)) * 100 : 0,
      linesWithoutCost,
      revenueWithoutCost,
    },
    profitByMedicine,
    topMedicines,
    byCategory,
    bySupplier,
  };
}

// Parses ?start=YYYY-MM-DD&end=YYYY-MM-DD into a local-time range (default: last 30 days). null = invalid.
export function parseReportRange(url: URL) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  const fromDate = startParam ? new Date(`${startParam}T00:00:00`) : new Date(defaultFrom.getFullYear(), defaultFrom.getMonth(), defaultFrom.getDate());
  const toDate = endParam ? new Date(`${endParam}T23:59:59.999`) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) return null;
  return { fromDate, toDate };
}
