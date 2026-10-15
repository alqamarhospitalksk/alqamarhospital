import type { Prisma } from "@prisma/client";
import { toDateColumnBoundary } from "./date-range";

// In-patient admissions: the rules shared by the operator's Admissions pages, the medical store's
// In-patients page and the reports.

export const ADMISSION_CATEGORIES = ["MEDICAL", "SURGICAL", "CRITICAL", "NICU"] as const;
export const admissionCategoryLabels: Record<string, string> = {
  MEDICAL: "Medical treatment",
  SURGICAL: "Surgical (operation)",
  // The client asked for "suspicious" patients to be admitted as critical, for both the room and the treatment.
  CRITICAL: "Critical / suspicious",
  NICU: "NICU (newborn)",
};

export const ROOM_CATEGORIES = ["PRIVATE", "WARD", "CRITICAL", "NICU"] as const;
export const roomCategoryLabels: Record<string, string> = {
  PRIVATE: "Private room",
  WARD: "Ward",
  CRITICAL: "Critical care",
  NICU: "NICU",
};

// Which configured rooms/beds each kind of admission may be placed in. A manually entered room
// is always allowed (for a custom arrangement or price).
export const allowedRoomCategories: Record<string, readonly string[]> = {
  MEDICAL: ["PRIVATE", "WARD"],
  SURGICAL: ["PRIVATE", "WARD"],
  CRITICAL: ["CRITICAL"],
  NICU: ["NICU"],
};

export const MEDICINE_PURPOSES = ["WARD", "OT", "HOME"] as const;
export const medicinePurposeLabels: Record<string, string> = {
  WARD: "Ward medicine",
  OT: "OT medicine",
  HOME: "Home (discharge) medicine",
};

// A bed stays taken until the patient is discharged (or the admission is cancelled).
export const ACTIVE_STATUSES = ["ADMITTED", "INVOICED"];
// An OT case (not part of an admission) can receive store medicine until it is discharged.
export const OPEN_OT_STATUSES = ["BOOKED", "IN_PROGRESS", "READY_FOR_DISCHARGE"];

type CreditSaleLike = { total: { toString(): string }; creditStatus: string | null; returns: { totalRefund: { toString(): string }; refundMode: string }[] };
// A credit sale after medicine returned before payment (CREDIT returns only lower the bill).
export const creditNet = (sale: CreditSaleLike) =>
  Math.round((Number(sale.total) - sale.returns.filter((r) => r.refundMode === "CREDIT").reduce((sum, r) => sum + Number(r.totalRefund), 0)) * 100) / 100;
// What the patient still owes the store on one credit sale (0 once the store has marked it paid).
export const creditOwed = (sale: CreditSaleLike) => (sale.creditStatus === "UNSETTLED" ? creditNet(sale) : 0);

export const round2 = (value: number) => Math.round(value * 100) / 100;

// A doctor's admission visit fee has its own hospital/doctor split, independent of the OPD one.
// PERCENTAGE = % of each day's fee kept by the hospital; FIXED = PKR kept per day.
export function admissionFeeProblem(fee: number, splitType: string, splitValue: number) {
  if (!Number.isFinite(fee) || fee < 0) return "Enter a valid admission daily fee (zero or more).";
  if (!["PERCENTAGE", "FIXED"].includes(splitType)) return "Invalid admission split type.";
  if (!Number.isFinite(splitValue) || splitValue < 0 || (splitType === "PERCENTAGE" && splitValue > 100)) return "The admission split must be zero or more (and at most 100%).";
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// The clinic's rule for counting days: a stay shorter than 24 hours is charged as one day. Once it
// reaches 24 hours, every calendar date from the admission date to the end date is charged
// (admitted on the 1st at 10:00, still here on the 2nd at 14:00 = 2 days).
export function chargeDateKeys(admittedAt: Date, end: Date): string[] {
  const first = localDateKey(admittedAt);
  if (end.getTime() - admittedAt.getTime() < DAY_MS) return [first];
  const keys: string[] = [];
  const cursor = new Date(admittedAt.getFullYear(), admittedAt.getMonth(), admittedAt.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    keys.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

// chargeDate is a `@db.Date` column, so it is stored and compared as UTC midnight of the local date
// (see lib/date-range.ts). Reading it back, the UTC date is therefore the local calendar date.
const dateColumn = (key: string) => toDateColumnBoundary(new Date(`${key}T00:00:00`));
export const dayKeyOf = (chargeDate: Date) => chargeDate.toISOString().slice(0, 10);

type AccrualAdmission = {
  id: number;
  status: string;
  admittedAt: Date;
  invoicedAt: Date | null;
  roomLabel: string;
  dailyRoomRate: Prisma.Decimal | number;
  doctorId: number;
  dailyDoctorFee: Prisma.Decimal | number;
  dailyTechnicianFee: Prisma.Decimal | number;
};

// There is no scheduler on the hosting, so the daily room / doctor / technician rows are added
// whenever an admission is listed, opened or changed. It only ever adds the days that are missing,
// at the admission's current rates, and never changes a day that already exists, so running it
// any number of times charges each day once. After the invoice it stops at the invoice time.
export async function accrueAdmissionDays(client: Prisma.TransactionClient, admission: AccrualAdmission) {
  if (!ACTIVE_STATUSES.includes(admission.status)) return 0;
  const keys = chargeDateKeys(admission.admittedAt, admission.invoicedAt ?? new Date());
  const existing = await client.admissionDay.findMany({ where: { admissionId: admission.id }, select: { chargeDate: true } });
  const have = new Set(existing.map((day) => dayKeyOf(day.chargeDate)));
  const missing = keys.filter((key) => !have.has(key));
  if (missing.length === 0) return 0;
  await client.admissionDay.createMany({
    data: missing.map((key) => ({
      admissionId: admission.id,
      chargeDate: dateColumn(key),
      roomLabel: admission.roomLabel,
      roomRate: admission.dailyRoomRate,
      doctorId: admission.doctorId,
      doctorFee: admission.dailyDoctorFee,
      technicianFee: admission.dailyTechnicianFee,
    })),
    // Two screens opening the same admission at the same moment must not fail on the unique key.
    skipDuplicates: true,
  });
  return missing.length;
}

// Everything needed to work out an admission's bill, for findUnique/findMany `include`.
export const admissionBillInclude = {
  patient: true,
  doctor: true,
  roomBed: true,
  days: { orderBy: { chargeDate: "asc" }, include: { doctor: { select: { name: true } } } },
  charges: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "asc" } },
  otCases: { orderBy: { createdAt: "asc" }, include: { doctor: { select: { name: true } }, payments: true, lineItems: true } },
  medicineSales: {
    orderBy: { createdAt: "asc" },
    include: { items: { include: { medicineItem: { select: { name: true } } } }, returns: { select: { totalRefund: true, refundMode: true } } },
  },
} satisfies Prisma.AdmissionInclude;

export type AdmissionWithBill = Prisma.AdmissionGetPayload<{ include: typeof admissionBillInclude }>;

const paid = (payments: { amount: Prisma.Decimal; status: string }[]) =>
  payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + Number(p.amount), 0);

// The bill has two independent parts, kept apart so both sets of books stay right:
//  - hospital: room, doctor visits (days the doctor came), technician, extra charges and linked
//    operations, paid through the operator (Payment.admissionId / the operation's own payments);
//  - medical store: medicine issued on credit, which becomes store income only when the store
//    marks it paid. Medicine returned before that only lowers what is owed.
export function admissionBill(admission: AdmissionWithBill) {
  const roomTotal = admission.days.reduce((sum, d) => sum + Number(d.roomRate), 0);
  const doctorTotal = admission.days.filter((d) => d.doctorVisited).reduce((sum, d) => sum + Number(d.doctorFee), 0);
  const technicianTotal = admission.days.reduce((sum, d) => sum + Number(d.technicianFee), 0);
  const extrasTotal = admission.charges.reduce((sum, c) => sum + Number(c.amount), 0);
  const operations = admission.otCases.filter((c) => c.status !== "CANCELLED");
  const operationsTotal = operations.reduce((sum, c) => sum + Number(c.total), 0);
  const hospitalTotal = round2(roomTotal + doctorTotal + technicianTotal + extrasTotal + operationsTotal);
  // Admission payments include a negative row when an excess advance was handed back.
  const hospitalPaid = round2(paid(admission.payments) + operations.reduce((sum, c) => sum + paid(c.payments), 0));

  const medicines = admission.medicineSales.map((sale) => ({ sale, net: creditNet(sale), owed: creditOwed(sale) }));
  const byPurpose: Record<string, number> = { WARD: 0, OT: 0, HOME: 0 };
  for (const m of medicines) byPurpose[m.sale.purpose ?? "WARD"] = round2((byPurpose[m.sale.purpose ?? "WARD"] ?? 0) + m.net);

  return {
    days: admission.days.length,
    roomTotal: round2(roomTotal),
    doctorTotal: round2(doctorTotal),
    technicianTotal: round2(technicianTotal),
    extrasTotal: round2(extrasTotal),
    operationsTotal: round2(operationsTotal),
    hospitalTotal,
    hospitalPaid,
    // Negative = the patient paid more than the bill (an advance), to be handed back before discharge.
    hospitalBalance: round2(hospitalTotal - hospitalPaid),
    medicines,
    storeTotal: round2(medicines.reduce((sum, m) => sum + m.net, 0)),
    storeOwed: round2(medicines.reduce((sum, m) => sum + m.owed, 0)),
    storeByPurpose: byPurpose,
  };
}

const money = (value: { toString(): string } | number) => Number(value.toString());

// The JSON the Admissions pages work with.
export function serializeAdmission(admission: AdmissionWithBill) {
  const bill = admissionBill(admission);
  return {
    id: admission.id,
    admissionNumber: admission.admissionNumber,
    status: admission.status,
    category: admission.category,
    categoryLabel: admissionCategoryLabels[admission.category] ?? admission.category,
    admittedAt: admission.admittedAt,
    invoicedAt: admission.invoicedAt,
    dischargedAt: admission.dischargedAt,
    diagnosis: admission.diagnosis,
    notes: admission.notes,
    attendantName: admission.attendantName,
    attendantMobile: admission.attendantMobile,
    patient: {
      id: admission.patient.id,
      name: admission.patient.name,
      mrNumber: admission.patient.mrNumber,
      fatherName: admission.patient.fatherName,
      gender: admission.patient.gender,
      dateOfBirth: admission.patient.dateOfBirth,
      mobile: admission.patient.mobile,
    },
    doctor: { id: admission.doctor.id, name: admission.doctor.name, specialization: admission.doctor.specialization },
    roomBedId: admission.roomBedId,
    roomLabel: admission.roomLabel,
    roomCategory: admission.roomBed?.category ?? null,
    dailyRoomRate: money(admission.dailyRoomRate),
    dailyDoctorFee: money(admission.dailyDoctorFee),
    dailyTechnicianFee: money(admission.dailyTechnicianFee),
    days: admission.days.map((d) => ({
      id: d.id,
      date: dayKeyOf(d.chargeDate),
      roomLabel: d.roomLabel,
      roomRate: money(d.roomRate),
      doctorName: d.doctor.name,
      doctorFee: money(d.doctorFee),
      doctorVisited: d.doctorVisited,
      technicianFee: money(d.technicianFee),
    })),
    charges: admission.charges.map((c) => ({ id: c.id, description: c.description, amount: money(c.amount), createdAt: c.createdAt })),
    operations: admission.otCases.map((c) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      procedureName: c.procedureName,
      procedureAt: c.procedureAt,
      doctorName: c.doctor.name,
      total: money(c.total),
      breakdown: {
        theaterFee: money(c.theaterFee),
        doctorFee: money(c.doctorFee),
        anesthesiaFee: money(c.anesthesiaFee),
        hospitalFee: money(c.hospitalFee),
        items: c.lineItems.reduce((sum, item) => sum + Number(item.total), 0),
      },
    })),
    payments: admission.payments.map((p) => ({ id: p.id, amount: money(p.amount), method: p.method, status: p.status, note: p.note, createdAt: p.createdAt })),
    medicines: bill.medicines.map(({ sale, net, owed }) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      purpose: sale.purpose ?? "WARD",
      creditStatus: sale.creditStatus,
      createdAt: sale.createdAt,
      settledAt: sale.settledAt,
      total: money(sale.total),
      net,
      owed,
      items: sale.items.map((i) => ({ name: i.medicineItem.name, quantity: money(i.quantity), total: money(i.total) })),
    })),
    bill: {
      days: bill.days,
      roomTotal: bill.roomTotal,
      doctorTotal: bill.doctorTotal,
      technicianTotal: bill.technicianTotal,
      extrasTotal: bill.extrasTotal,
      operationsTotal: bill.operationsTotal,
      hospitalTotal: bill.hospitalTotal,
      hospitalPaid: bill.hospitalPaid,
      hospitalBalance: bill.hospitalBalance,
      storeTotal: bill.storeTotal,
      storeOwed: bill.storeOwed,
      storeByPurpose: bill.storeByPurpose,
    },
  };
}
