import { db } from "./db";

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

// What one doctor earned from the given visits / OT cases / diagnostic receipts / admission days.
// The doctor's money is collected by the hospital but is owed to the doctor — it is not hospital
// income, and paying it out later only settles that debt (it is never a hospital expense).
export function computeDoctorShare(doc: ShareDoctor, visits: ShareVisit[], cases: ShareOtCase[], receipts: ShareReceipt[], admissionDays: ShareAdmissionDay[] = []) {
  const docVisits = visits.filter((v) => v.doctorId === doc.id);
  const docCases = cases.filter((c) => c.doctorId === doc.id);
  const consultationCollected =
    docVisits.reduce((sum, v) => sum + Number(v.consultationFee), 0) +
    docCases.reduce((sum, c) => sum + Number(c.doctorFee), 0);

  const splitVal = Number(doc.hospitalSplitValue);
  const consultationHospitalShare = doc.hospitalSplitType === "PERCENTAGE"
    ? consultationCollected * (splitVal / 100)
    : Math.min(consultationCollected, (docVisits.length + docCases.length) * splitVal);
  const consultationDoctorShare = Math.max(0, consultationCollected - consultationHospitalShare);

  // Admission visit fees use the doctor's separate admission split (a % of each day, or PKR per day).
  const docDays = admissionDays.filter((d) => d.doctorId === doc.id);
  const admissionCollected = docDays.reduce((sum, d) => sum + Number(d.doctorFee), 0);
  const admissionSplit = Number(doc.admissionSplitValue);
  const admissionHospitalShare = doc.admissionSplitType === "PERCENTAGE"
    ? admissionCollected * (admissionSplit / 100)
    : docDays.reduce((sum, d) => sum + Math.min(Number(d.doctorFee), admissionSplit), 0);
  const admissionShare = Math.max(0, admissionCollected - admissionHospitalShare);

  const diagnosticShare = receipts
    .filter((r) => r.doctorId === doc.id)
    .reduce((sum, r) => {
      const field = moduleShareField[r.module as keyof typeof moduleShareField];
      return field ? sum + Number(r.total) * (Number(doc[field]) / 100) : sum;
    }, 0);

  return {
    totalCollected: consultationCollected + admissionCollected,
    hospitalShare: consultationHospitalShare + admissionHospitalShare,
    diagnosticShare,
    admissionShare,
    doctorShare: consultationDoctorShare + admissionShare + diagnosticShare,
  };
}

// Visited days of discharged admissions, in the shape computeDoctorShare takes. Dated by discharge,
// like OT cases: the doctor's admission earnings count once the stay is closed and fully paid.
export async function admissionShareDays(since?: Date | null, until?: Date | null) {
  const rows = await db.admissionDay.findMany({
    where: {
      doctorVisited: true,
      admission: { status: "DISCHARGED", ...(since || until ? { dischargedAt: { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) } } : {}) },
    },
    select: { doctorId: true, doctorFee: true, admission: { select: { dischargedAt: true } } },
  });
  return rows.map((r) => ({ doctorId: r.doctorId, doctorFee: r.doctorFee, dischargedAt: r.admission.dischargedAt }));
}

// Total doctor share earned across all doctors in [since, until) — the part of the gross
// collection that belongs to doctors. Uses the same dates as the Payouts page: OPD by visit date,
// OT and admissions by discharge date, diagnostics by receipt date. `dateColSince/Until` are the
// toDateColumnBoundary() versions for the @db.Date visitDate column.
export async function doctorShareForPeriod(since: Date, until: Date, dateColSince: Date, dateColUntil: Date) {
  const [doctors, visits, cases, receipts, admissionDays] = await Promise.all([
    db.doctor.findMany(),
    db.opdVisit.findMany({ where: { visitDate: { gte: dateColSince, lt: dateColUntil } }, select: { doctorId: true, consultationFee: true, visitDate: true } }),
    db.otCase.findMany({ where: { status: "DISCHARGED", dischargeDate: { gte: since, lt: until } }, select: { doctorId: true, doctorFee: true, dischargeDate: true } }),
    db.diagnosticReceipt.findMany({ where: { status: "PAID", createdAt: { gte: since, lt: until } }, select: { doctorId: true, module: true, total: true, createdAt: true } }),
    admissionShareDays(since, until),
  ]);
  const byDoctor = doctors.map((doc) => ({ id: doc.id, name: doc.name, ...computeDoctorShare(doc, visits, cases, receipts, admissionDays) }));
  return { total: byDoctor.reduce((sum, d) => sum + d.doctorShare, 0), byDoctor };
}

// What the hospital still owes its doctors RIGHT NOW: every active doctor's lifetime share minus
// everything already paid to them. Not tied to any date range. These are the same rules, and so the
// same numbers, as "Balance Due" on the Payouts page (app/api/finance/route.ts), summed over doctors.
export async function doctorBalancesLifetime() {
  const [doctors, visits, cases, receipts, payouts, admissionDays] = await Promise.all([
    db.doctor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.opdVisit.findMany({ select: { doctorId: true, consultationFee: true, visitDate: true } }),
    db.otCase.findMany({ where: { status: "DISCHARGED" }, select: { doctorId: true, doctorFee: true, dischargeDate: true } }),
    db.diagnosticReceipt.findMany({ where: { status: "PAID" }, select: { doctorId: true, module: true, total: true, createdAt: true } }),
    db.expense.findMany({ where: { category: "DOCTOR_PAYOUT" }, select: { doctorId: true, amount: true } }),
    admissionShareDays(),
  ]);
  const byDoctor = doctors.map((doc) => {
    const earned = computeDoctorShare(doc, visits, cases, receipts, admissionDays).doctorShare;
    const paid = payouts.filter((p) => p.doctorId === doc.id).reduce((sum, p) => sum + Number(p.amount), 0);
    return { id: doc.id, name: doc.name, earned, paid, balance: earned - paid };
  });
  const totalEarned = byDoctor.reduce((sum, d) => sum + d.earned, 0);
  const totalPaid = byDoctor.reduce((sum, d) => sum + d.paid, 0);
  return { totalEarned, totalPaid, totalRemaining: totalEarned - totalPaid, byDoctor };
}
