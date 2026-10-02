import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];
// "DUE" is only valid when adding an item: the patient will pay for it later.
const itemPaymentMethods = [...paymentMethods, "DUE"];

// What the patient has actually paid so far across every payment on the case (the admission
// payment plus any payment taken when more items were added).
const paidSoFar = (payments: { amount: unknown; status?: string }[]) =>
  payments.filter((p) => p.status === undefined || p.status === "PAID").reduce((sum, p) => sum + Number(p.amount), 0);
const round2 = (value: number) => Math.round(value * 100) / 100;

function caseTotal(otCase: { doctorFee: unknown; theaterFee: unknown; anesthesiaFee: unknown; roomFee: unknown; hospitalFee: unknown; otMedicineFee: unknown; homeMedicineFee: unknown }, lineItemsTotal: number) {
  return (
    Number(otCase.doctorFee) +
    Number(otCase.theaterFee) +
    Number(otCase.anesthesiaFee) +
    Number(otCase.roomFee) +
    Number(otCase.hospitalFee) +
    Number(otCase.otMedicineFee) +
    Number(otCase.homeMedicineFee) +
    lineItemsTotal
  );
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;
  const caseId = Number((await context.params).id);
  if (!Number.isInteger(caseId)) return NextResponse.json({ error: "Invalid OT case ID." }, { status: 400 });
  const markInvoiced = new URL(request.url).searchParams.get("markInvoiced") === "1";

  const otCase = await db.otCase.findUnique({
    where: { id: caseId },
    include: {
      patient: true,
      doctor: true,
      roomBed: true,
      lineItems: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!otCase) return NextResponse.json({ error: "OT Case not found." }, { status: 404 });

  // The response below reflects lastInvoicedAt as it was BEFORE this update, so the
  // caller can tell what's new since the last slip. Only bump it after reading.
  if (markInvoiced) {
    await db.otCase.update({ where: { id: caseId }, data: { lastInvoicedAt: new Date() } });
  }

  return NextResponse.json({
    otCase: {
      ...otCase,
      roomBed: { name: otCase.roomLabel ?? otCase.roomBed?.name ?? "—" },
    },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;
  const caseId = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const action = text(body?.action).toUpperCase();
  if (!Number.isInteger(caseId) || !["CONSUME", "READY_FOR_DISCHARGE", "DISCHARGE", "RECORD_PAYMENT"].includes(action)) return NextResponse.json({ error: "Invalid OT action." }, { status: 400 });

  try {
    const result = await db.$transaction(async (transaction) => {
      const otCase = await transaction.otCase.findUnique({ where: { id: caseId }, include: { patient: true, doctor: true, roomBed: true, lineItems: true, payments: true } });
      if (!otCase) throw new Error("OT case not found.");

      if (action === "RECORD_PAYMENT") {
        // Collects whatever is still outstanding: the full bill for a case admitted as "Due", or the
        // cost of items added later and left unpaid.
        const balance = round2(Number(otCase.total) - paidSoFar(otCase.payments));
        if (balance <= 0) throw new Error("Nothing is outstanding on this case — it is fully paid.");
        const paymentMethod = text(body?.paymentMethod).toUpperCase();
        if (!paymentMethods.includes(paymentMethod)) throw new Error("Select a valid payment method.");
        const payment = await transaction.payment.create({
          data: {
            amount: balance,
            method: paymentMethod as "CASH",
            status: "PAID",
            note: `OT payment recorded — ${otCase.caseNumber}`,
            otCaseId: caseId,
            createdById: user.id,
          },
        });
        return { kind: action, case: otCase, payment, amountPaid: balance };
      }

      if (action === "CONSUME") {
        if (!["BOOKED", "IN_PROGRESS"].includes(otCase.status)) throw new Error("This case cannot receive procedure items.");
        const description = text(body?.description);
        const category = text(body?.category) || "OTHER";
        const unitPrice = Number(body?.unitPrice);
        const quantity = Number(body?.quantity);
        if (!description || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter an item name, valid price, and quantity.");
        // Same rule as admission: how the item is paid for must be chosen explicitly, so a charge
        // can never be added to the bill without either collecting it or marking it Due.
        const itemPaymentMethod = text(body?.paymentMethod).toUpperCase();
        if (!itemPaymentMethods.includes(itemPaymentMethod)) throw new Error("Select how the patient is paying for this item (or Due).");
        const itemTotal = round2(quantity * unitPrice);
        const lineItem = await transaction.otLineItem.create({ data: { otCaseId: caseId, description, category, quantity, unitPrice, total: itemTotal } });
        if (itemPaymentMethod !== "DUE" && itemTotal > 0) {
          await transaction.payment.create({
            data: {
              amount: itemTotal,
              method: itemPaymentMethod as "CASH",
              status: "PAID",
              note: `OT added item — ${otCase.caseNumber}: ${description}`,
              otCaseId: caseId,
              createdById: user.id,
            },
          });
        }
        const lineItemsTotal = otCase.lineItems.reduce((sum, item) => sum + Number(item.total), 0) + Number(lineItem.total);
        const total = caseTotal(otCase, lineItemsTotal);
        const updatedCase = await transaction.otCase.update({ where: { id: caseId }, data: { status: "IN_PROGRESS", total } });
        return { kind: action, case: updatedCase, item: lineItem };
      }

      if (action === "READY_FOR_DISCHARGE") {
        if (!["BOOKED", "IN_PROGRESS"].includes(otCase.status)) throw new Error("This case is not ready for discharge.");
        const updatedCase = await transaction.otCase.update({ where: { id: caseId }, data: { status: "READY_FOR_DISCHARGE" } });
        return { kind: action, case: updatedCase };
      }

      if (!["BOOKED", "IN_PROGRESS", "READY_FOR_DISCHARGE"].includes(otCase.status)) throw new Error("This case cannot be discharged.");
      const dischargeDate = new Date();
      // Room charge is a manually-entered amount from admission, not a per-day rate — no recalculation here.
      // Payment itself was already collected and recorded at admission; discharge only finalizes the case.
      const lineItemsTotal = otCase.lineItems.reduce((sum, item) => sum + Number(item.total), 0);
      const total = caseTotal(otCase, lineItemsTotal);
      const updatedCase = await transaction.otCase.update({ where: { id: caseId }, data: { status: "DISCHARGED", dischargeDate, total }, include: { patient: true, doctor: true, roomBed: true, lineItems: true } });
      return { kind: action, case: updatedCase };
    });

    const paymentMethod = "payment" in result ? result.payment?.method : undefined;
    const amountPaid = "amountPaid" in result ? result.amountPaid : undefined;
    await db.auditLog.create({ data: { action: result.kind === "DISCHARGE" ? "UPDATE" : "CREATE", entity: "OtCase", entityId: String(caseId), userId: user.id, afterJson: JSON.stringify({ action: result.kind, caseNumber: result.case.caseNumber, paymentMethod }) } });
    return NextResponse.json({ result: { action: result.kind, caseNumber: result.case.caseNumber, status: result.case.status, total: result.case.total.toString(), paymentMethod, amountPaid } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update OT case." }, { status: 409 });
  }
}
