import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { toDateColumnBoundary } from "../../../lib/date-range";
import { doctorShareForPeriod } from "../../../lib/doctor-share";
import { storeRefundsForPeriod } from "../../../lib/store-refunds";
import { describePaymentParty, paymentInclude, paymentSource, serviceKeys, serviceLabels } from "../../../lib/payment-source";


function dateOnly(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function serializeAmount(value: { toString(): string }) {
  return Number(value.toString());
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MANAGEMENT"]);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const today = new Date();
  const start = dateOnly(params.get("start"), new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const end = dateOnly(params.get("end"), new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  end.setDate(end.getDate() + (params.get("end") ? 1 : 0));
  // Bounded to a year so the Yearly chart view has full coverage without pulling the
  // hospital's entire payment history on every dashboard load.
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  // expenseDate and visitDate are `@db.Date` columns — see lib/date-range.ts for why they
  // need UTC-anchored boundaries instead of the plain local-midnight `start`/`end` used for
  // the DateTime (createdAt) queries below.
  const dateColStart = toDateColumnBoundary(start);
  const dateColEnd = toDateColumnBoundary(end);

  const [storeRefunds, doctorShares, payments, allExpenses, patientsSeen, patientCount, doctorCount, labTestCount, otCaseCount, recentPayments, revenueHistory] = await Promise.all([
    storeRefundsForPeriod(start, end),
    doctorShareForPeriod(start, end, dateColStart, dateColEnd),
    db.payment.findMany({ where: { createdAt: { gte: start, lt: end }, status: "PAID" }, orderBy: { createdAt: "asc" }, include: paymentInclude }),
    db.expense.findMany({ where: { expenseDate: { gte: dateColStart, lt: dateColEnd } }, orderBy: { expenseDate: "asc" }, include: { doctor: true, employee: true } }),
    db.opdVisit.findMany({ where: { visitDate: { gte: dateColStart, lt: dateColEnd } }, select: { patientId: true } }),
    db.patient.count(),
    db.doctor.count({ where: { active: true } }),
    // Lifetime totals (not date-range scoped), like patientCount/doctorCount above.
    db.diagnosticReceipt.count({ where: { module: "LABORATORY" } }),
    db.otCase.count(),
    db.payment.findMany({ where: { createdAt: { gte: start, lt: end }, status: "PAID" }, orderBy: { createdAt: "desc" }, take: 8, include: paymentInclude }),
    db.payment.findMany({ where: { createdAt: { gte: yearAgo }, status: "PAID" }, select: { createdAt: true, amount: true } }),
  ]);

  const totals: Record<string, number> = Object.fromEntries(serviceKeys.map((key) => [key, 0]));
  for (const payment of payments) {
    const source = paymentSource(payment);
    totals[source] = (totals[source] ?? 0) + serializeAmount(payment.amount);
  }
  // Medicine returns were paid back to customers, so they come off the medical-store income.
  totals.MEDICAL_STORE -= storeRefunds.total;
  const collected = payments.reduce((sum, payment) => sum + serializeAmount(payment.amount), 0) - storeRefunds.total;
  // The doctor's part of every slip is collected by the hospital but belongs to the doctor, so it
  // comes off the gross as soon as it is earned. Paying the doctor later only clears what the
  // hospital owes them (the Payouts page balance) — it is not a hospital expense, so DOCTOR_PAYOUT
  // rows are kept out of expenses and net revenue, or the doctor's money would be taken off twice.
  const expenses = allExpenses.filter((expense) => expense.category !== "DOCTOR_PAYOUT");
  const doctorPayoutRows = allExpenses.filter((expense) => expense.category === "DOCTOR_PAYOUT");
  const doctorShare = doctorShares.total;
  const hospitalShare = collected - doctorShare;
  const doctorPayouts = doctorPayoutRows.reduce((sum, expense) => sum + serializeAmount(expense.amount), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + serializeAmount(expense.amount), 0);
  // MEDICAL_STORE_WASTAGE is a positive expense (cash cut for damaged/expired stock);
  // SUPPLIER_REFUND is stored as a negative expense (cash added back), so its magnitude here
  // is the abs value for display — both already net correctly into totalExpenses above.
  const medicineWastage = expenses.filter((e) => e.category === "MEDICAL_STORE_WASTAGE").reduce((sum, e) => sum + serializeAmount(e.amount), 0);
  const supplierRefunds = expenses.filter((e) => e.category === "SUPPLIER_REFUND").reduce((sum, e) => sum + Math.abs(serializeAmount(e.amount)), 0);
  const uniquePatients = new Set(patientsSeen.map((visit) => visit.patientId)).size;

  function describePayment(payment: (typeof payments)[number]) {
    const party = describePaymentParty(payment);
    const source = paymentSource(payment);
    return {
      id: payment.id,
      patient: party.patientName,
      mrNumber: party.mrNumber,
      doctor: party.doctorName,
      detail: `${party.mrNumber} · ${party.doctorName}`,
      type: source === "OPD" ? "Consultation" : serviceLabels[source] ?? source,
      amount: serializeAmount(payment.amount),
      status: payment.status,
      method: payment.method,
      createdAt: payment.createdAt,
    };
  }
  const activity = recentPayments.map(describePayment);
  // Unlike `activity` (capped to 8, for the on-screen chart), this covers every paid
  // transaction in the selected range — what the PDF/Excel exports need for a complete report.
  const transactions = [
    ...payments.map(describePayment),
    ...storeRefunds.rows.map((r) => ({
      id: -r.id,
      patient: r.customer,
      mrNumber: r.mrNumber,
      doctor: "",
      detail: `${r.mrNumber} · ${r.returnNumber}`,
      type: "Medical store refund",
      amount: -r.amount,
      status: "REFUNDED",
      method: "CASH",
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const expenseDetail = expenses.map((expense) => ({
    id: expense.id,
    category: expense.category,
    linkedTo: expense.doctor?.name ?? expense.employee?.name ?? "General clinic",
    amount: serializeAmount(expense.amount),
    method: expense.method,
    note: expense.note ?? "",
    expenseDate: expense.expenseDate,
  }));
  const doctorPayoutDetail = doctorPayoutRows.map((expense) => ({
    id: expense.id,
    doctor: expense.doctor?.name ?? "",
    amount: serializeAmount(expense.amount),
    method: expense.method,
    note: expense.note ?? "",
    expenseDate: expense.expenseDate,
  }));
  const doctorShareDetail = doctorShares.byDoctor
    .filter((d) => d.doctorShare > 0)
    .map((d) => ({ doctor: d.name, amount: d.doctorShare }))
    .sort((a, b) => b.amount - a.amount);

  return NextResponse.json({
    start: start.toISOString(),
    end: end.toISOString(),
    totals,
    collected,
    doctorShare,
    hospitalShare,
    doctorPayouts,
    storeRefunds: storeRefunds.total,
    totalExpenses,
    medicineWastage,
    supplierRefunds,
    netRevenue: hospitalShare - totalExpenses,
    patientsSeen: uniquePatients,
    patientCount,
    doctorCount,
    labTestCount,
    otCaseCount,
    activity,
    transactions,
    expenseDetail,
    doctorShareDetail,
    doctorPayoutDetail,
    revenueHistory: revenueHistory.map((p) => ({ createdAt: p.createdAt, amount: serializeAmount(p.amount) })),
  });
}
