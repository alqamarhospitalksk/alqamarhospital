export const runtime = "nodejs";

import { formatDate } from "../../../../lib/format-date";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { toDateColumnBoundary } from "../../../../lib/date-range";
import { doctorShareForPeriod } from "../../../../lib/doctor-share";
import { storeRefundsForPeriod } from "../../../../lib/store-refunds";
import { describePaymentParty, paymentInclude, paymentSource, serviceLabels } from "../../../../lib/payment-source";

const BRAND = "FF123D3B";
const BRAND_LIGHT = "FFEAF1EF";
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE1E9E6" } },
  left: { style: "thin", color: { argb: "FFE1E9E6" } },
  bottom: { style: "thin", color: { argb: "FFE1E9E6" } },
  right: { style: "thin", color: { argb: "FFE1E9E6" } },
};
const DATE_FMT = "dd-mmm-yyyy hh:mm AM/PM";
const MONEY_FMT = "#,##0.00";

function dateOnly(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.border = BORDER;
    cell.alignment = { vertical: "middle" };
  });
  row.height = 20;
}

function styleDataRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    const row = sheet.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = BORDER;
    });
    if ((r - startRow) % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFCFB" } };
      });
    }
  }
}

function addTotalRow(sheet: ExcelJS.Worksheet, label: string, amountColLetter: string, dataStartRow: number, dataEndRow: number, labelColSpan: number) {
  const totalRow = sheet.addRow([]);
  totalRow.getCell(1).value = label;
  sheet.mergeCells(totalRow.number, 1, totalRow.number, labelColSpan);
  const amountCell = totalRow.getCell(labelColSpan + 1);
  amountCell.value = dataEndRow >= dataStartRow ? { formula: `SUM(${amountColLetter}${dataStartRow}:${amountColLetter}${dataEndRow})` } : 0;
  amountCell.numFmt = MONEY_FMT;
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: "FF123D3B" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
    cell.border = { ...BORDER, top: { style: "medium", color: { argb: "FF123D3B" } } };
  });
  return totalRow;
}

function addTitleBlock(sheet: ExcelJS.Worksheet, hospitalName: string, subtitle: string, lastCol: number) {
  const titleRow = sheet.addRow([hospitalName]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, lastCol);
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: "FF123D3B" } };
  titleRow.height = 26;

  const subRow = sheet.addRow([subtitle]);
  sheet.mergeCells(subRow.number, 1, subRow.number, lastCol);
  subRow.getCell(1).font = { italic: true, size: 11, color: { argb: "FF607D76" } };

  sheet.addRow([]);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const today = new Date();
  const start = dateOnly(params.get("start"), new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const end = dateOnly(params.get("end"), new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  end.setDate(end.getDate() + (params.get("end") ? 1 : 0));
  const reportEndInclusive = new Date(end.getTime() - 86400000);
  // expenseDate is a `@db.Date` column — see lib/date-range.ts for why it needs a
  // UTC-anchored boundary instead of the plain local-midnight start/end used for the
  // DateTime (createdAt) payments query below.
  const dateColStart = toDateColumnBoundary(start);
  const dateColEnd = toDateColumnBoundary(end);

  const [payments, allExpenses, hospitalSettings, doctorShares, storeRefunds] = await Promise.all([
    db.payment.findMany({ where: { createdAt: { gte: start, lt: end }, status: "PAID" }, orderBy: { createdAt: "asc" }, include: paymentInclude }),
    db.expense.findMany({ where: { expenseDate: { gte: dateColStart, lt: dateColEnd } }, orderBy: { expenseDate: "asc" }, include: { doctor: true, employee: true } }),
    db.hospitalSettings.findUnique({ where: { id: 1 } }),
    doctorShareForPeriod(start, end, dateColStart, dateColEnd),
    storeRefundsForPeriod(start, end),
  ]);

  // Doctor payouts settle money owed to doctors (their share is already taken off the gross below),
  // so they are not hospital expenses — same rule as the dashboard.
  const expenses = allExpenses.filter((expense) => expense.category !== "DOCTOR_PAYOUT");
  const doctorPayouts = allExpenses.filter((expense) => expense.category === "DOCTOR_PAYOUT").reduce((sum, expense) => sum + Number(expense.amount), 0);

  const hospitalName = hospitalSettings?.name || "Al Qamar Hospital";
  // Medicine returns were paid back to customers, so they come off the gross (and the medical-store line).
  const collected = payments.reduce((sum, payment) => sum + Number(payment.amount), 0) - storeRefunds.total;
  const doctorShare = doctorShares.total;
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const periodLabel = `Period: ${formatDate(start)} to ${formatDate(reportEndInclusive)}  ·  Generated: ${new Date().toLocaleString("en-GB", { hour12: true })}`;

  const serviceTotals: Record<string, number> = {};
  for (const payment of payments) {
    const source = paymentSource(payment);
    serviceTotals[source] = (serviceTotals[source] ?? 0) + Number(payment.amount);
  }
  serviceTotals.MEDICAL_STORE = (serviceTotals.MEDICAL_STORE ?? 0) - storeRefunds.total;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Al Qamar Hospital";
  workbook.created = new Date();

  // ---- Summary sheet ----
  const summary = workbook.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  summary.columns = [{ key: "metric", width: 42 }, { key: "amount", width: 22 }];
  addTitleBlock(summary, hospitalName, periodLabel, 2);
  const summaryHeaderRow = summary.addRow(["Metric", "Amount (PKR)"]);
  styleHeaderRow(summaryHeaderRow);
  const summaryDataStart = summary.rowCount + 1;
  summary.addRow(["Report start", formatDate(start)]);
  summary.addRow(["Report end", formatDate(reportEndInclusive)]);
  const collectedRowNum = summary.rowCount + 1;
  summary.addRow(["Total collected", collected]);
  const doctorShareRowNum = summary.rowCount + 1;
  summary.addRow(["Doctor share (owed to doctors)", doctorShare]);
  const hospitalShareRowNum = summary.rowCount + 1;
  summary.addRow(["Hospital share", { formula: `B${collectedRowNum}-B${doctorShareRowNum}` }]);
  const expensesRowNum = summary.rowCount + 1;
  summary.addRow(["Total expenses", totalExpenses]);
  const netRowNum = summary.rowCount + 1;
  summary.addRow(["Net revenue (hospital share - expenses)", { formula: `B${hospitalShareRowNum}-B${expensesRowNum}` }]);
  const payoutsRowNum = summary.rowCount + 1;
  summary.addRow(["Doctor payouts made (paid from doctor share)", doctorPayouts]);
  for (const rowNum of [collectedRowNum, doctorShareRowNum, hospitalShareRowNum, expensesRowNum, netRowNum, payoutsRowNum]) {
    summary.getCell(`B${rowNum}`).numFmt = MONEY_FMT;
  }
  summary.getRow(netRowNum).font = { bold: true, color: { argb: "FF123D3B" } };
  summary.getRow(netRowNum).eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } }; });
  styleDataRows(summary, summaryDataStart, summary.rowCount);
  summary.views = [{ state: "frozen", ySplit: summaryHeaderRow.number, showGridLines: false }];

  // ---- Income by Service sheet ----
  const serviceSheet = workbook.addWorksheet("Income by Service", { views: [{ showGridLines: false }] });
  serviceSheet.columns = [{ key: "service", width: 28 }, { key: "amount", width: 20 }, { key: "share", width: 14 }];
  addTitleBlock(serviceSheet, hospitalName, periodLabel, 3);
  const serviceHeaderRow = serviceSheet.addRow(["Service", "Collected (PKR)", "Share"]);
  styleHeaderRow(serviceHeaderRow);
  const serviceDataStart = serviceSheet.rowCount + 1;
  const sortedServices = Object.keys(serviceLabels)
    .map((key) => ({ label: serviceLabels[key], amount: serviceTotals[key] ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  for (const row of sortedServices) {
    const excelRow = serviceSheet.addRow([row.label, row.amount, collected > 0 ? row.amount / collected : 0]);
    excelRow.getCell(2).numFmt = MONEY_FMT;
    excelRow.getCell(3).numFmt = "0.0%";
  }
  const serviceDataEnd = serviceSheet.rowCount;
  styleDataRows(serviceSheet, serviceDataStart, serviceDataEnd);
  addTotalRow(serviceSheet, "Total", "B", serviceDataStart, serviceDataEnd, 1);
  serviceSheet.autoFilter = { from: { row: serviceHeaderRow.number, column: 1 }, to: { row: serviceHeaderRow.number, column: 3 } };
  serviceSheet.views = [{ state: "frozen", ySplit: serviceHeaderRow.number, showGridLines: false }];

  // ---- Income (transaction detail) sheet ----
  const transactionSheet = workbook.addWorksheet("Income", { views: [{ showGridLines: false }] });
  transactionSheet.columns = [
    { key: "date", width: 20 },
    { key: "patient", width: 24 },
    { key: "mrNumber", width: 16 },
    { key: "doctor", width: 24 },
    { key: "service", width: 20 },
    { key: "amount", width: 16 },
    { key: "method", width: 16 },
  ];
  addTitleBlock(transactionSheet, hospitalName, periodLabel, 7);
  const incomeHeaderRow = transactionSheet.addRow(["Date", "Patient", "MR Number", "Doctor", "Service", "Amount (PKR)", "Method"]);
  styleHeaderRow(incomeHeaderRow);
  const incomeDataStart = transactionSheet.rowCount + 1;
  for (const payment of payments) {
    const party = describePaymentParty(payment);
    const excelRow = transactionSheet.addRow([
      payment.createdAt,
      party.patientName,
      party.mrNumber,
      party.doctorName,
      serviceLabels[paymentSource(payment)] ?? "Other",
      Number(payment.amount),
      payment.method.replaceAll("_", " "),
    ]);
    excelRow.getCell(1).numFmt = DATE_FMT;
    excelRow.getCell(6).numFmt = MONEY_FMT;
  }
  for (const refund of storeRefunds.rows) {
    const excelRow = transactionSheet.addRow([refund.createdAt, refund.customer, refund.mrNumber, "", "Medical store refund", -refund.amount, "CASH"]);
    excelRow.getCell(1).numFmt = DATE_FMT;
    excelRow.getCell(6).numFmt = MONEY_FMT;
  }
  const incomeDataEnd = transactionSheet.rowCount;
  styleDataRows(transactionSheet, incomeDataStart, incomeDataEnd);
  addTotalRow(transactionSheet, "Total collected", "F", incomeDataStart, incomeDataEnd, 5);
  transactionSheet.autoFilter = { from: { row: incomeHeaderRow.number, column: 1 }, to: { row: incomeHeaderRow.number, column: 7 } };
  transactionSheet.views = [{ state: "frozen", ySplit: incomeHeaderRow.number, showGridLines: false }];

  // ---- Expenses sheet ----
  const expenseSheet = workbook.addWorksheet("Expenses", { views: [{ showGridLines: false }] });
  expenseSheet.columns = [
    { key: "date", width: 20 },
    { key: "category", width: 22 },
    { key: "linked", width: 24 },
    { key: "amount", width: 16 },
    { key: "method", width: 16 },
    { key: "note", width: 36 },
  ];
  addTitleBlock(expenseSheet, hospitalName, periodLabel, 6);
  const expenseHeaderRow = expenseSheet.addRow(["Date", "Category", "Linked To", "Amount (PKR)", "Method", "Note"]);
  styleHeaderRow(expenseHeaderRow);
  const expenseDataStart = expenseSheet.rowCount + 1;
  for (const expense of expenses) {
    const excelRow = expenseSheet.addRow([
      expense.expenseDate,
      expense.category.replaceAll("_", " "),
      expense.doctor?.name ?? expense.employee?.name ?? "General clinic",
      Number(expense.amount),
      expense.method.replaceAll("_", " "),
      expense.note ?? "",
    ]);
    excelRow.getCell(1).numFmt = DATE_FMT;
    excelRow.getCell(4).numFmt = MONEY_FMT;
  }
  const expenseDataEnd = expenseSheet.rowCount;
  styleDataRows(expenseSheet, expenseDataStart, expenseDataEnd);
  addTotalRow(expenseSheet, "Total expenses", "D", expenseDataStart, expenseDataEnd, 3);
  expenseSheet.autoFilter = { from: { row: expenseHeaderRow.number, column: 1 }, to: { row: expenseHeaderRow.number, column: 6 } };
  expenseSheet.views = [{ state: "frozen", ySplit: expenseHeaderRow.number, showGridLines: false }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="careledger-report-${start.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
