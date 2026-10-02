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
};
export type ShareVisit = { doctorId: number; consultationFee: { toString(): string }; visitDate: Date };
export type ShareOtCase = { doctorId: number; doctorFee: { toString(): string }; dischargeDate: Date | null };
export type ShareReceipt = { doctorId: number | null; module: string; total: { toString(): string }; createdAt: Date };

// What one doctor earned from the given visits / OT cases / diagnostic receipts.
// The doctor's money is collected by the hospital but is owed to the doctor — it is not hospital
// income, and paying it out later only settles that debt (it is never a hospital expense).
export function computeDoctorShare(doc: ShareDoctor, visits: ShareVisit[], cases: ShareOtCase[], receipts: ShareReceipt[]) {
  const docVisits = visits.filter((v) => v.doctorId === doc.id);
  const docCases = cases.filter((c) => c.doctorId === doc.id);
  const totalCollected =
    docVisits.reduce((sum, v) => sum + Number(v.consultationFee), 0) +
    docCases.reduce((sum, c) => sum + Number(c.doctorFee), 0);

  const splitVal = Number(doc.hospitalSplitValue);
  const hospitalShare = doc.hospitalSplitType === "PERCENTAGE"
    ? totalCollected * (splitVal / 100)
    : Math.min(totalCollected, (docVisits.length + docCases.length) * splitVal);
  const consultationDoctorShare = Math.max(0, totalCollected - hospitalShare);

  const diagnosticShare = receipts
    .filter((r) => r.doctorId === doc.id)
    .reduce((sum, r) => {
      const field = moduleShareField[r.module as keyof typeof moduleShareField];
      return field ? sum + Number(r.total) * (Number(doc[field]) / 100) : sum;
    }, 0);

  return { totalCollected, hospitalShare, diagnosticShare, doctorShare: consultationDoctorShare + diagnosticShare };
}

// Total doctor share earned across all doctors in [since, until) — the part of the gross
// collection that belongs to doctors. Uses the same dates as the Payouts page: OPD by visit date,
// OT by discharge date, diagnostics by receipt date. `dateColSince/Until` are the
// toDateColumnBoundary() versions for the @db.Date visitDate column.
export async function doctorShareForPeriod(since: Date, until: Date, dateColSince: Date, dateColUntil: Date) {
  const [doctors, visits, cases, receipts] = await Promise.all([
    db.doctor.findMany(),
    db.opdVisit.findMany({ where: { visitDate: { gte: dateColSince, lt: dateColUntil } }, select: { doctorId: true, consultationFee: true, visitDate: true } }),
    db.otCase.findMany({ where: { status: "DISCHARGED", dischargeDate: { gte: since, lt: until } }, select: { doctorId: true, doctorFee: true, dischargeDate: true } }),
    db.diagnosticReceipt.findMany({ where: { status: "PAID", createdAt: { gte: since, lt: until } }, select: { doctorId: true, module: true, total: true, createdAt: true } }),
  ]);
  const byDoctor = doctors.map((doc) => ({ id: doc.id, name: doc.name, ...computeDoctorShare(doc, visits, cases, receipts) }));
  return { total: byDoctor.reduce((sum, d) => sum + d.doctorShare, 0), byDoctor };
}
