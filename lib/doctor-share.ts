import { db } from "./db";
import { toDateColumnBoundary } from "./date-range";

// Diagnostic tests are billed by the operator, not the referring doctor — the doctor's cut is a
// referral commission calculated from each doctor's per-module share percentage, not something
// selected at billing time.
const moduleShareField = {
  LABORATORY: "labSharePercent",
  "X-RAY": "xraySharePercent",
  ULTRASOUND: "ultrasoundSharePercent",
  ECG: "ecgSharePercent",
  ECO: "ecoSharePercent",
} as const;

type ShareDoctor = {
  id: number;
  hospitalSplitType: string;
  hospitalSplitValue: { toString(): string };
  labSharePercent: { toString(): string };
  xraySharePercent: { toString(): string };
  ultrasoundSharePercent: { toString(): string };
  ecgSharePercent: { toString(): string };
  ecoSharePercent: { toString(): string };
  admissionSplitType: string;
  admissionSplitValue: { toString(): string };
};
export type ShareVisit = { doctorId: number; consultationFee: { toString(): string }; visitDate: Date };
export type ShareOtCase = { doctorId: number; doctorFee: { toString(): string }; dischargeDate: Date | null };
export type ShareReceipt = { doctorId: number | null; module: string; total: { toString(): string }; createdAt: Date };
// One charged day of a discharged admission on which the doctor actually came.
export type ShareAdmissionDay = { doctorId: number; doctorFee: { toString(): string }; dischargedAt: Date | null };

// What one doctor brought in, already added up: the sum and number of OPD visits + discharged OT
// cases, receipt totals per diagnostic module, and admission visit fees grouped by fee amount.
// The database produces these with GROUP BY (doctorTotals below), so no page has to load every
// visit, receipt and admission day ever recorded just to work out a balance.
export type DoctorTotals = {
  consultationSum: number;
  consultationCount: number;
  receiptsByModule: Record<string, number>;
  admissionDays: { fee: number; count: number }[];
};

const emptyTotals = (): DoctorTotals => ({ consultationSum: 0, consultationCount: 0, receiptsByModule: {}, admissionDays: [] });

// What one doctor earned. The doctor's money is collected by the hospital but is owed to the
// doctor — it is not hospital income, and paying it out later only settles that debt (it is never
// a hospital expense).
export function shareFromTotals(doc: ShareDoctor, totals: DoctorTotals) {
  const consultationCollected = totals.consultationSum;
  const splitVal = Number(doc.hospitalSplitValue);
  const consultationHospitalShare = doc.hospitalSplitType === "PERCENTAGE"
    ? consultationCollected * (splitVal / 100)
    : Math.min(consultationCollected, totals.consultationCount * splitVal);
  const consultationDoctorShare = Math.max(0, consultationCollected - consultationHospitalShare);

  // Admission visit fees use the doctor's separate admission split (a % of each day, or PKR per day).
  const admissionCollected = totals.admissionDays.reduce((sum, d) => sum + d.fee * d.count, 0);
  const admissionSplit = Number(doc.admissionSplitValue);
  const admissionHospitalShare = doc.admissionSplitType === "PERCENTAGE"
    ? admissionCollected * (admissionSplit / 100)
    : totals.admissionDays.reduce((sum, d) => sum + Math.min(d.fee, admissionSplit) * d.count, 0);
  const admissionShare = Math.max(0, admissionCollected - admissionHospitalShare);

  const diagnosticShare = Object.entries(totals.receiptsByModule).reduce((sum, [module, total]) => {
    const field = moduleShareField[module as keyof typeof moduleShareField];
    return field ? sum + total * (Number(doc[field]) / 100) : sum;
  }, 0);

  return {
    totalCollected: consultationCollected + admissionCollected,
    hospitalShare: consultationHospitalShare + admissionHospitalShare,
    diagnosticShare,
    admissionShare,
    doctorShare: consultationDoctorShare + admissionShare + diagnosticShare,
  };
}

// The same result as shareFromTotals, for callers that already have the rows loaded.
export function computeDoctorShare(doc: ShareDoctor, visits: ShareVisit[], cases: ShareOtCase[], receipts: ShareReceipt[], admissionDays: ShareAdmissionDay[] = []) {
  const totals = emptyTotals();
  for (const v of visits) {
    if (v.doctorId !== doc.id) continue;
    totals.consultationSum += Number(v.consultationFee);
    totals.consultationCount += 1;
  }
  for (const c of cases) {
    if (c.doctorId !== doc.id) continue;
    totals.consultationSum += Number(c.doctorFee);
    totals.consultationCount += 1;
  }
  for (const r of receipts) {
    if (r.doctorId === doc.id) totals.receiptsByModule[r.module] = (totals.receiptsByModule[r.module] ?? 0) + Number(r.total);
  }
  const byFee = new Map<number, number>();
  for (const d of admissionDays) {
    if (d.doctorId === doc.id) byFee.set(Number(d.doctorFee), (byFee.get(Number(d.doctorFee)) ?? 0) + 1);
  }
  totals.admissionDays = [...byFee.entries()].map(([fee, count]) => ({ fee, count }));
  return shareFromTotals(doc, totals);
}

// Per-doctor totals for a period, or for all time when no range is given. The dates are the
// Payouts page's: OPD by visit date, OT and admissions by discharge date, diagnostics by receipt
// date. `since`/`until` are local-midnight boundaries (until exclusive); either may be left open.
export async function doctorTotals(range?: { since: Date | null; until: Date | null }) {
  const since = range?.since ?? null;
  const until = range?.until ?? null;
  const bounded = Boolean(since || until);
  const between = { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) };
  // visitDate is a @db.Date column, so its boundaries are re-anchored to UTC (lib/date-range.ts).
  const visitBetween = { ...(since ? { gte: toDateColumnBoundary(since) } : {}), ...(until ? { lt: toDateColumnBoundary(until) } : {}) };

  const [visits, cases, receipts, days] = await Promise.all([
    // For a period, reading that period's visits and adding them up here is faster: with no index
    // on visit_date alone, MySQL answers a ranged GROUP BY by walking the whole doctor index.
    bounded
      ? db.opdVisit
          .findMany({ where: { visitDate: visitBetween }, select: { doctorId: true, consultationFee: true } })
          .then((rows) => {
            const byDoctor = new Map<number, { sum: number; count: number }>();
            for (const row of rows) {
              const entry = byDoctor.get(row.doctorId) ?? { sum: 0, count: 0 };
              entry.sum += Number(row.consultationFee);
              entry.count += 1;
              byDoctor.set(row.doctorId, entry);
            }
            return [...byDoctor.entries()].map(([doctorId, entry]) => ({ doctorId, _sum: { consultationFee: entry.sum }, _count: { _all: entry.count } }));
          })
      : db.opdVisit.groupBy({ by: ["doctorId"], _sum: { consultationFee: true }, _count: { _all: true } }),
    db.otCase.groupBy({ by: ["doctorId"], where: { status: "DISCHARGED", ...(bounded ? { dischargeDate: between } : {}) }, _sum: { doctorFee: true }, _count: { _all: true } }),
    db.diagnosticReceipt.groupBy({ by: ["doctorId", "module"], where: { status: "PAID", ...(bounded ? { createdAt: between } : {}) }, _sum: { total: true } }),
    db.admissionDay.groupBy({
      by: ["doctorId", "doctorFee"],
      where: { doctorVisited: true, admission: { status: "DISCHARGED", ...(bounded ? { dischargedAt: between } : {}) } },
      _count: { _all: true },
    }),
  ]);

  const totals = new Map<number, DoctorTotals>();
  const entryFor = (doctorId: number) => {
    let entry = totals.get(doctorId);
    if (!entry) {
      entry = emptyTotals();
      totals.set(doctorId, entry);
    }
    return entry;
  };
  for (const row of visits) {
    const entry = entryFor(row.doctorId);
    entry.consultationSum += Number(row._sum.consultationFee ?? 0);
    entry.consultationCount += row._count._all;
  }
  for (const row of cases) {
    const entry = entryFor(row.doctorId);
    entry.consultationSum += Number(row._sum.doctorFee ?? 0);
    entry.consultationCount += row._count._all;
  }
  for (const row of receipts) {
    const entry = entryFor(row.doctorId);
    entry.receiptsByModule[row.module] = (entry.receiptsByModule[row.module] ?? 0) + Number(row._sum.total ?? 0);
  }
  for (const row of days) entryFor(row.doctorId).admissionDays.push({ fee: Number(row.doctorFee), count: row._count._all });

  return (doctorId: number) => totals.get(doctorId) ?? emptyTotals();
}

// What has been paid out to each doctor, all time.
export async function doctorPayoutTotals() {
  const rows = await db.expense.groupBy({ by: ["doctorId"], where: { category: "DOCTOR_PAYOUT" }, _sum: { amount: true } });
  const paid = new Map(rows.map((row) => [row.doctorId, Number(row._sum.amount ?? 0)]));
  return (doctorId: number) => paid.get(doctorId) ?? 0;
}

// Total doctor share earned across all doctors in [since, until) — the part of the gross
// collection that belongs to doctors. Uses the same dates as the Payouts page.
export async function doctorShareForPeriod(since: Date, until: Date) {
  const [doctors, totalsFor] = await Promise.all([db.doctor.findMany(), doctorTotals({ since, until })]);
  const byDoctor = doctors.map((doc) => ({ id: doc.id, name: doc.name, ...shareFromTotals(doc, totalsFor(doc.id)) }));
  return { total: byDoctor.reduce((sum, d) => sum + d.doctorShare, 0), byDoctor };
}

// What the hospital still owes its doctors RIGHT NOW: every active doctor's lifetime share minus
// everything already paid to them. Not tied to any date range. These are the same rules, and so the
// same numbers, as "Balance Due" on the Payouts page (app/api/finance/route.ts), summed over doctors.
export async function doctorBalancesLifetime() {
  const [doctors, totalsFor, paidTo] = await Promise.all([
    db.doctor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    doctorTotals(),
    doctorPayoutTotals(),
  ]);
  const byDoctor = doctors.map((doc) => {
    const earned = shareFromTotals(doc, totalsFor(doc.id)).doctorShare;
    const paid = paidTo(doc.id);
    return { id: doc.id, name: doc.name, earned, paid, balance: earned - paid };
  });
  const totalEarned = byDoctor.reduce((sum, d) => sum + d.earned, 0);
  const totalPaid = byDoctor.reduce((sum, d) => sum + d.paid, 0);
  return { totalEarned, totalPaid, totalRemaining: totalEarned - totalPaid, byDoctor };
}
