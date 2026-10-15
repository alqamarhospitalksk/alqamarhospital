import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";
import { OPEN_OT_STATUSES, admissionCategoryLabels, creditNet, creditOwed, round2 } from "../../../../lib/admission";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];

// The store gives medicine on credit to two kinds of patient bill: an admission, and an OT case
// that is not part of an admission. Both appear in one list; `kind` says which.
const saleInclude = {
  returns: { select: { totalRefund: true, refundMode: true } },
  items: { include: { medicineItem: { select: { name: true } } } },
} as const;
type CreditSale = {
  id: number;
  saleNumber: string;
  createdAt: Date;
  total: { toString(): string };
  creditStatus: string | null;
  purpose: string | null;
  returns: { totalRefund: { toString(): string }; refundMode: string }[];
  items: { quantity: { toString(): string }; medicineItem: { name: string } }[];
};

function summarize(sales: CreditSale[]) {
  const byPurpose: Record<string, number> = { WARD: 0, OT: 0, HOME: 0 };
  for (const sale of sales) byPurpose[sale.purpose ?? "WARD"] = round2((byPurpose[sale.purpose ?? "WARD"] ?? 0) + creditNet(sale));
  return {
    issued: round2(sales.reduce((sum, s) => sum + creditNet(s), 0)),
    owed: round2(sales.reduce((sum, s) => sum + creditOwed(s), 0)),
    byPurpose,
    saleCount: sales.length,
  };
}

const serializeSales = (sales: CreditSale[]) =>
  sales.map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    createdAt: s.createdAt,
    purpose: s.purpose ?? "WARD",
    creditStatus: s.creditStatus,
    total: Number(s.total),
    owed: creditOwed(s),
    items: s.items.map((i) => `${i.medicineItem.name} ×${Number(i.quantity)}`).join(", "),
  }));

type AdmissionRow = Awaited<ReturnType<typeof loadAdmissions>>[number];
type OtRow = Awaited<ReturnType<typeof loadOtCases>>[number];

function loadAdmissions(where: object) {
  return db.admission.findMany({ where, orderBy: { admittedAt: "desc" }, include: { patient: true, medicineSales: { orderBy: { createdAt: "asc" }, include: saleInclude } } });
}
function loadOtCases(where: object) {
  return db.otCase.findMany({ where: { admissionId: null, ...where }, orderBy: { admissionDate: "desc" }, include: { patient: true, medicineSales: { orderBy: { createdAt: "asc" }, include: saleInclude } } });
}

const fromAdmission = (a: AdmissionRow) => ({
  kind: "ADMISSION" as const,
  id: a.id,
  number: a.admissionNumber,
  status: a.status,
  // Medicine can be issued until the final invoice; it is due once the stay is invoiced.
  canIssue: a.status === "ADMITTED",
  readyToSettle: a.status === "INVOICED",
  category: admissionCategoryLabels[a.category] ?? a.category,
  admittedAt: a.admittedAt,
  roomLabel: a.roomLabel,
  patient: { id: a.patient.id, name: a.patient.name, mrNumber: a.patient.mrNumber },
  medicines: summarize(a.medicineSales),
  sales: serializeSales(a.medicineSales),
});

const fromOtCase = (c: OtRow) => ({
  kind: "OT" as const,
  id: c.id,
  number: c.caseNumber,
  status: c.status,
  // Medicine can be issued until the operator discharges the OT patient.
  canIssue: OPEN_OT_STATUSES.includes(c.status),
  readyToSettle: c.status === "READY_FOR_DISCHARGE",
  category: `Operation theater${c.procedureName ? ` · ${c.procedureName}` : ""}`,
  admittedAt: c.admissionDate,
  roomLabel: c.roomLabel ?? "—",
  patient: { id: c.patient.id, name: c.patient.name, mrNumber: c.patient.mrNumber },
  medicines: summarize(c.medicineSales),
  sales: serializeSales(c.medicineSales),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MEDICAL_STORE", "MANAGEMENT"]);
  if (denied) return denied;

  // One patient bill, for the Sell page's in-patient (credit) mode.
  const params = new URL(request.url).searchParams;
  const admissionId = Number(params.get("admissionId"));
  const otCaseId = Number(params.get("otCaseId"));
  if (admissionId || otCaseId) {
    const bill = admissionId
      ? (await loadAdmissions({ id: admissionId })).map(fromAdmission)[0]
      : (await loadOtCases({ id: otCaseId })).map(fromOtCase)[0];
    if (!bill) return NextResponse.json({ error: "Patient bill not found." }, { status: 404 });
    return NextResponse.json({ bill });
  }

  // Patients the store can issue to now, plus every bill that still owes the store.
  const owes = { medicineSales: { some: { creditStatus: "UNSETTLED" } } };
  const [admissions, otCases] = await Promise.all([
    loadAdmissions({ OR: [{ status: "ADMITTED" }, owes] }),
    loadOtCases({ OR: [{ status: { in: OPEN_OT_STATUSES } }, owes] }),
  ]);
  const bills = [...admissions.map(fromAdmission), ...otCases.map(fromOtCase)].sort((a, b) => new Date(b.admittedAt).getTime() - new Date(a.admittedAt).getTime());
  return NextResponse.json({ bills });
}

// "Mark paid": the patient's medicine money has reached the store counter (handed over by the
// operator at discharge, or paid by the family). Each unsettled credit sale gets its Payment row now,
// so it counts as store income — and in the store's day closing — on the day the cash arrives.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MEDICAL_STORE", "MANAGEMENT"]);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const admissionId = body?.admissionId ? Number(body.admissionId) : null;
  const otCaseId = !admissionId && body?.otCaseId ? Number(body.otCaseId) : null;
  const method = text(body?.method).toUpperCase();
  if (!Number.isInteger(admissionId ?? otCaseId)) return NextResponse.json({ error: "Select the patient's admission or OT case." }, { status: 400 });
  if (!paymentMethods.includes(method)) return NextResponse.json({ error: "Select how the medicine bill was paid." }, { status: 400 });

  try {
    const result = await db.$transaction(async (transaction) => {
      const where = { creditStatus: "UNSETTLED", ...(admissionId ? { admissionId } : { otCaseId }) };
      const reference = admissionId
        ? (await transaction.admission.findUnique({ where: { id: admissionId }, select: { admissionNumber: true } }))?.admissionNumber
        : (await transaction.otCase.findUnique({ where: { id: otCaseId! }, select: { caseNumber: true } }))?.caseNumber;
      if (!reference) throw new Error("Patient bill not found.");
      const sales = await transaction.medicineSale.findMany({ where, include: { returns: { select: { totalRefund: true, refundMode: true } } } });
      if (sales.length === 0) throw new Error("Nothing is owed to the store for this patient.");
      const now = new Date();
      let total = 0;
      for (const sale of sales) {
        const owed = creditOwed(sale);
        if (owed > 0.005) {
          await transaction.payment.create({ data: { amount: owed, method: method as "CASH", status: "PAID", note: `In-patient medicine — ${reference}`, medicineSaleId: sale.id, createdById: user.id } });
          total += owed;
        }
        await transaction.medicineSale.update({ where: { id: sale.id }, data: { creditStatus: "SETTLED", settledAt: now } });
      }
      return { reference, total: round2(total), count: sales.length };
    });

    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entity: admissionId ? "Admission" : "OtCase",
        entityId: String(admissionId ?? otCaseId),
        userId: user.id,
        afterJson: JSON.stringify({ action: "STORE_SETTLED", reference: result.reference, amount: result.total, method, sales: result.count }),
      },
    });
    return NextResponse.json({ settled: { number: result.reference, amount: result.total, method } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to settle the medicine bill." }, { status: 409 });
  }
}
