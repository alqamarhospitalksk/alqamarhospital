import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";
import { creditNet, creditOwed } from "../../../../lib/admission";

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
      medicineSales: { orderBy: { createdAt: "asc" }, include: { returns: { select: { totalRefund: true, refundMode: true } }, items: { include: { medicineItem: { select: { name: true } } } } } },
    },
  });

  if (!otCase) return NextResponse.json({ error: "OT Case not found." }, { status: 404 });
  const { medicineSales, ...caseFields } = otCase;
  // Medicine from the store is paid at the store (not part of `total`); shown on the bill for the family.
  const storeMedicines = medicineSales.map((s) => ({
    saleNumber: s.saleNumber,
    purpose: s.purpose ?? "OT",
    items: s.items.map((i) => `${i.medicineItem.name} ×${Number(i.quantity)}`).join(", "),
    amount: creditNet(s),
    paid: s.creditStatus !== "UNSETTLED",
  }));

  // The response below reflects lastInvoicedAt as it was BEFORE this update, so the
  // caller can tell what's new since the last slip. Only bump it after reading.
  if (markInvoiced) {
    await db.otCase.update({ where: { id: caseId }, data: { lastInvoicedAt: new Date() } });
  }

  return NextResponse.json({
    otCase: {
      ...caseFields,
      roomBed: { name: otCase.roomLabel ?? otCase.roomBed?.name ?? "—" },
      storeMedicines,
      storeTotal: round2(storeMedicines.reduce((sum, m) => sum + m.amount, 0)),
      storeOwed: round2(medicineSales.reduce((sum, s) => sum + creditOwed(s), 0)),
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
      const otCase = await transaction.otCase.findUnique({ where: { id: caseId }, include: { patient: true, doctor: true, roomBed: true, lineItems: true, payments: true, admission: { select: { admissionNumber: true } } } });
      if (!otCase) throw new Error("OT case not found.");
      // An operation added from an admission is paid and discharged on that admission's bill only,
      // so its money is never collected twice or in two places.
      if (otCase.admission && ["RECORD_PAYMENT", "READY_FOR_DISCHARGE", "DISCHARGE"].includes(action)) {
        throw new Error(`This operation is billed with admission ${otCase.admission.admissionNumber}. Take payments and discharge from the Admissions page.`);
      }
      if (otCase.admission && action === "CONSUME" && text(body?.paymentMethod).toUpperCase() !== "DUE") {
        throw new Error(`This operation is billed with admission ${otCase.admission.admissionNumber}. Add the item as Due — it is collected on the admission bill.`);
      }

      if (action === "RECORD_PAYMENT") {
        // Collects all or PART of what is still outstanding. A family can pay in as many instalments as
        // they like: each one is its own payment (counted as income on the day it is received) until
        // the balance reaches zero. Leaving the amount out pays the whole balance.
        const balance = round2(Number(otCase.total) - paidSoFar(otCase.payments));
        if (balance <= 0) throw new Error("Nothing is outstanding on this case — it is fully paid.");
        const paymentMethod = text(body?.paymentMethod).toUpperCase();
        if (!paymentMethods.includes(paymentMethod)) throw new Error("Select a valid payment method.");
        const requested = body?.amount !== undefined && body.amount !== null && body.amount !== "" ? round2(Number(body.amount)) : balance;
        if (!Number.isFinite(requested) || requested <= 0) throw new Error("Enter the amount being paid now (more than zero).");
        if (requested > balance + 0.005) throw new Error(`That is more than what is still due (PKR ${balance}).`);
        const amountNow = Math.min(requested, balance);
        const payment = await transaction.payment.create({
          data: {
            amount: amountNow,
            method: paymentMethod as "CASH",
            status: "PAID",
            note: amountNow < balance ? `OT part-payment — ${otCase.caseNumber}, balance PKR ${round2(balance - amountNow)}` : `OT payment recorded — ${otCase.caseNumber}`,
            otCaseId: caseId,
            createdById: user.id,
          },
        });
        return { kind: action, case: otCase, payment, amountPaid: amountNow, balanceAfter: round2(balance - amountNow) };
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
      // A patient cannot leave with money still owed: the balance must be collected first.
      const outstanding = round2(Number(total) - paidSoFar(otCase.payments));
      if (outstanding > 0.005) throw new Error(`PKR ${outstanding} is still due. Collect the payment before discharging this patient.`);
      // Medicine the store issued to this patient must be paid at the store first (the store marks it paid).
      const credit = await transaction.medicineSale.findMany({ where: { otCaseId: caseId, creditStatus: "UNSETTLED" }, include: { returns: { select: { totalRefund: true, refundMode: true } } } });
      const storeOwed = round2(credit.reduce((sum, s) => sum + creditOwed(s), 0));
      if (storeOwed > 0.005) throw new Error(`The medical store has not yet been paid PKR ${storeOwed} for this patient's medicine. Pay the store; once it marks it paid, the patient can be discharged.`);
      // Credit sales whose medicine was all returned owe nothing; close them too.
      if (credit.length) await transaction.medicineSale.updateMany({ where: { id: { in: credit.map((s) => s.id) } }, data: { creditStatus: "SETTLED", settledAt: dischargeDate } });
      const updatedCase = await transaction.otCase.update({ where: { id: caseId }, data: { status: "DISCHARGED", dischargeDate, total }, include: { patient: true, doctor: true, roomBed: true, lineItems: true } });
      return { kind: action, case: updatedCase };
    });

    const paymentMethod = "payment" in result ? result.payment?.method : undefined;
    const amountPaid = "amountPaid" in result ? result.amountPaid : undefined;
    const balanceAfter = "balanceAfter" in result ? result.balanceAfter : undefined;
    await db.auditLog.create({ data: { action: result.kind === "DISCHARGE" ? "UPDATE" : "CREATE", entity: "OtCase", entityId: String(caseId), userId: user.id, afterJson: JSON.stringify({ action: result.kind, caseNumber: result.case.caseNumber, paymentMethod, amountPaid }) } });
    return NextResponse.json({ result: { action: result.kind, caseNumber: result.case.caseNumber, status: result.case.status, total: result.case.total.toString(), paymentMethod, amountPaid, balanceAfter } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update OT case." }, { status: 409 });
  }
}
