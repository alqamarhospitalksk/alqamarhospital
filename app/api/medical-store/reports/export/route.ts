export const runtime = "nodejs";

import { formatDate } from "../../../../../lib/format-date";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "../../../../../lib/auth";
import { db } from "../../../../../lib/db";
import { buildMedicalStoreReport, parseReportRange } from "../../../../../lib/medical-store-report";

// Same look as the Management Billing & Reports export (app/api/reports/export/route.ts).
const BRAND = "FF123D3B";
const BRAND_LIGHT = "FFEAF1EF";
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE1E9E6" } },
  left: { style: "thin", color: { argb: "FFE1E9E6" } },
  bottom: { style: "thin", color: { argb: "FFE1E9E6" } },
  right: { style: "thin", color: { argb: "FFE1E9E6" } },
};
const MONEY_FMT = "#,##0.00";

function canAccess(role: string) {
  return role === "MEDICAL_STORE" || role === "MANAGEMENT";
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addTitleBlock(sheet: ExcelJS.Worksheet, hospitalName: string, subtitle: string, lastCol: number) {
  const titleRow = sheet.addRow([hospitalName]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, lastCol);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: BRAND } };
  titleRow.height = 26;
  const subRow = sheet.addRow([subtitle]);
  sheet.mergeCells(subRow.number, 1, subRow.number, lastCol);
  subRow.getCell(1).font = { italic: true, size: 11, color: { argb: "FF607D76" } };
  sheet.addRow([]);
}

// Adds a styled table: header row, zebra-striped data rows, optional bold total row.
function addTable(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  rows: (string | number)[][],
  moneyCols: number[],
  total?: (string | number)[],
) {
  const header = sheet.addRow(headers);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.border = BORDER;
    cell.alignment = { vertical: "middle" };
  });
  header.height = 20;
  if (rows.length === 0) {
    const empty = sheet.addRow(["No records in this period."]);
    sheet.mergeCells(empty.number, 1, empty.number, headers.length);
    empty.getCell(1).font = { italic: true, color: { argb: "FF77908B" } };
  }
  rows.forEach((values, i) => {
    const row = sheet.addRow(values);
    for (let c = 1; c <= headers.length; c++) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      if (moneyCols.includes(c)) cell.numFmt = MONEY_FMT;
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFCFB" } };
    }
  });
  if (total && rows.length > 0) {
    const row = sheet.addRow(total);
    for (let c = 1; c <= headers.length; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true, color: { argb: BRAND } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
      cell.border = { ...BORDER, top: { style: "medium", color: { argb: BRAND } } };
      if (moneyCols.includes(c)) cell.numFmt = MONEY_FMT;
    }
  }
  sheet.views = [{ state: "frozen", ySplit: header.number, showGridLines: false }];
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canAccess(user.role)) return NextResponse.json({ error: "Medical store access is required." }, { status: 403 });

  const range = parseReportRange(new URL(request.url));
  if (!range) return NextResponse.json({ error: "Enter a valid date range." }, { status: 400 });

  const [report, hospitalSettings] = await Promise.all([
    buildMedicalStoreReport(range.fromDate, range.toDate),
    db.hospitalSettings.findUnique({ where: { id: 1 } }),
  ]);
  const t = report.totals;
  const hospitalName = hospitalSettings?.name || "Al Qamar Hospital";
  const startLabel = localDate(range.fromDate);
  const endLabel = localDate(range.toDate);
  const subtitle = `Medical Store Report  ·  Period: ${formatDate(startLabel)} to ${formatDate(endLabel)}  ·  Generated: ${new Date().toLocaleString("en-GB", { hour12: true })}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Qamar Hospital";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 36 }, { width: 22 }];
  addTitleBlock(summary, hospitalName, subtitle, 2);
  addTable(summary, ["Metric", "Amount (PKR)"], [
    ["Sales revenue", t.salesRevenue],
    ["Sale returns (refunded)", t.saleReturnsRefund],
    ["Net revenue (after sale returns)", t.netRevenue],
    ["Discounts given", t.salesDiscount],
    ["Purchases cost", t.purchasesCost],
    ["Purchase returns", t.purchaseReturnsAmount],
    ["Current stock value", t.stockValue],
    ["Cost of medicines sold", t.costOfGoodsSold],
    ["Profit", t.grossProfit],
    ["Profit margin", `${t.profitMarginPercent.toFixed(1)}%`],
    ["Number of sales", t.salesCount],
    ["Number of purchases", t.purchasesCount],
  ], [2]);
  // Counts and the margin text are not money — undo the money format on those rows.
  for (let r = summary.rowCount - 2; r <= summary.rowCount; r++) summary.getRow(r).getCell(2).numFmt = "General";
  if (t.linesWithoutCost > 0) {
    summary.addRow([]);
    const note = summary.addRow([`${t.linesWithoutCost} sold item(s) (PKR ${t.revenueWithoutCost.toLocaleString("en-PK")}) were sold before cost price was saved, so they are not in profit.`]);
    summary.mergeCells(note.number, 1, note.number, 2);
    note.getCell(1).font = { italic: true, color: { argb: "FFB26732" } };
  }

  const profitSheet = workbook.addWorksheet("Profit by Medicine");
  profitSheet.columns = [{ width: 30 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 12 }];
  addTitleBlock(profitSheet, hospitalName, subtitle, 6);
  const profitRows = report.profitByMedicine;
  addTable(
    profitSheet,
    ["Medicine", "Qty sold", "Sold for (PKR)", "Cost (PKR)", "Profit (PKR)", "Margin"],
    profitRows.map((m) => [m.medicineName, m.quantitySold, m.revenue, m.cost, m.profit, `${m.marginPercent.toFixed(1)}%`]),
    [3, 4, 5],
    ["Total", profitRows.reduce((s, m) => s + m.quantitySold, 0), profitRows.reduce((s, m) => s + m.revenue, 0), profitRows.reduce((s, m) => s + m.cost, 0), profitRows.reduce((s, m) => s + m.profit, 0), ""],
  );

  const topSheet = workbook.addWorksheet("Top-Selling Medicines");
  topSheet.columns = [{ width: 30 }, { width: 12 }, { width: 18 }];
  addTitleBlock(topSheet, hospitalName, subtitle, 3);
  addTable(topSheet, ["Medicine", "Qty sold", "Revenue (PKR)"], report.topMedicines.map((m) => [m.medicineName, m.quantitySold, m.revenue]), [3]);

  const categorySheet = workbook.addWorksheet("Sales by Category");
  categorySheet.columns = [{ width: 22 }, { width: 12 }, { width: 18 }];
  addTitleBlock(categorySheet, hospitalName, subtitle, 3);
  addTable(
    categorySheet,
    ["Category", "Qty sold", "Revenue (PKR)"],
    report.byCategory.map((c) => [c.category, c.quantitySold, c.revenue]),
    [3],
    ["Total", report.byCategory.reduce((s, c) => s + c.quantitySold, 0), report.byCategory.reduce((s, c) => s + c.revenue, 0)],
  );

  const supplierSheet = workbook.addWorksheet("Purchases by Supplier");
  supplierSheet.columns = [{ width: 30 }, { width: 14 }, { width: 18 }];
  addTitleBlock(supplierSheet, hospitalName, subtitle, 3);
  addTable(
    supplierSheet,
    ["Supplier", "Purchases", "Total cost (PKR)"],
    report.bySupplier.map((s) => [s.supplierName, s.purchaseCount, s.totalCost]),
    [3],
    ["Total", report.bySupplier.reduce((s, x) => s + x.purchaseCount, 0), report.bySupplier.reduce((s, x) => s + x.totalCost, 0)],
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="medical-store-report-${startLabel}-to-${endLabel}.xlsx"`,
    },
  });
}
