import { NextResponse } from "next/server";
import type { Admission, Prisma } from "@prisma/client";
import { getCurrentUser } from "../../../../lib/auth";
import { roleError } from "../../../../lib/roles";
import { db } from "../../../../lib/db";
import { runTransaction } from "../../../../lib/transaction";
import {
  ACTIVE_STATUSES,
  accrueAdmissionDays,
  admissionBill,
  admissionBillInclude,
  admissionCategoryLabels,
  allowedRoomCategories,
  dayKeyOf,
  localDateKey,
  round2,
  roomCategoryLabels,
  serializeAdmission,
} from "../../../../lib/admission";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];
const actions = ["COLLECT", "REFUND", "SET_DOCTOR_VISIT", "ADD_CHARGE", "REMOVE_CHARGE", "ADD_OPERATION", "ORDER_TESTS", "CANCEL_TEST", "UPDATE_STAY", "INVOICE", "REOPEN", "DISCHARGE", "CANCEL"];
const testModules = ["LABORATORY", "ECO", "X-RAY", "ECG", "ULTRASOUND"];
const amount = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? round2(n) : NaN;
};
const pkr = (value: number) => `PKR ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

async function loadSerialized(id: number) {
  const admission = await db.admission.findUnique({ where: { id }, include: admissionBillInclude });
  return admission ? serializeAdmission(admission) : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid admission." }, { status: 400 });

  const admission = await db.admission.findUnique({ where: { id } });
  if (!admission) return NextResponse.json({ error: "Admission not found." }, { status: 404 });
  await accrueAdmissionDays(db, admission);
  return NextResponse.json({ admission: await loadSerialized(id) });
}

type Transaction = Prisma.TransactionClient;

function requireStatus(admission: Admission, allowed: string[], message: string) {
  if (!allowed.includes(admission.status)) throw new Error(message);
}

async function fullBill(transaction: Transaction, id: number) {
  const full = await transaction.admission.findUniqueOrThrow({ where: { id }, include: admissionBillInclude });
  return { full, bill: admissionBill(full) };
}

async function checkBed(transaction: Transaction, admission: Admission, roomBedId: number, category: string) {
  const bed = await transaction.roomBed.findFirst({ where: { id: roomBedId, active: true } });
  if (!bed) throw new Error("That room/bed is not available.");
  if (!allowedRoomCategories[category].includes(bed.category)) {
    throw new Error(`${bed.name} is a ${roomCategoryLabels[bed.category] ?? bed.category} bed. A ${admissionCategoryLabels[category]} admission needs: ${allowedRoomCategories[category].map((c) => roomCategoryLabels[c]).join(" or ")}.`);
  }
  const taken = await transaction.admission.findFirst({ where: { roomBedId, status: { in: ACTIVE_STATUSES }, id: { not: admission.id } } });
  if (taken) throw new Error(`${bed.name} is occupied (${taken.admissionNumber}).`);
  return bed;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["OPERATOR", "MANAGEMENT"]);
  if (denied) return denied;
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const action = text(body?.action).toUpperCase();
  if (!Number.isInteger(id) || !actions.includes(action)) return NextResponse.json({ error: "Invalid admission action." }, { status: 400 });

  try {
    // runTransaction: ADD_OPERATION takes the next OT case number, which can clash with another save.
    const result = await runTransaction(async (transaction) => {
      const admission = await transaction.admission.findUnique({ where: { id } });
      if (!admission) throw new Error("Admission not found.");
      // Every change starts from a bill that is up to date to the minute.
      await accrueAdmissionDays(transaction, admission);

      if (action === "COLLECT") {
        requireStatus(admission, ACTIVE_STATUSES, "Payments can only be taken while the patient is admitted or invoiced.");
        const method = text(body?.method).toUpperCase();
        const value = amount(body?.amount);
        if (!paymentMethods.includes(method)) throw new Error("Select a valid payment method.");
        if (!Number.isFinite(value) || value <= 0) throw new Error("Enter the amount being paid (more than zero).");
        const { bill } = await fullBill(transaction, id);
        // Before the final invoice anything is accepted as an advance (the bill is still growing);
        // after it, no more than what is due.
        if (admission.status === "INVOICED") {
          if (bill.hospitalBalance <= 0.005) throw new Error("Nothing is due on the hospital bill.");
          if (value > bill.hospitalBalance + 0.005) throw new Error(`That is more than what is due (${pkr(bill.hospitalBalance)}).`);
        }
        const balanceAfter = round2(bill.hospitalBalance - value);
        const note = admission.status === "ADMITTED"
          ? `Admission advance — ${admission.admissionNumber}`
          : balanceAfter > 0.005 ? `Admission part-payment — ${admission.admissionNumber}, balance ${pkr(balanceAfter)}` : `Admission final payment — ${admission.admissionNumber}`;
        await transaction.payment.create({ data: { amount: value, method: method as "CASH", status: "PAID", note, admissionId: id, createdById: user.id } });
        return { admission, audit: { amount: value, method }, message: `${pkr(value)} received.` };
      }

      if (action === "REFUND") {
        requireStatus(admission, ["INVOICED"], "Generate the final invoice first; the excess is only known once the bill is final.");
        const method = text(body?.method).toUpperCase();
        if (!paymentMethods.includes(method)) throw new Error("Select how the money is handed back.");
        const { bill } = await fullBill(transaction, id);
        if (bill.hospitalBalance >= -0.005) throw new Error("The patient has not paid more than the bill.");
        // A negative payment on the day it is handed back, so the day's cash and income both drop by it.
        await transaction.payment.create({ data: { amount: bill.hospitalBalance, method: method as "CASH", status: "PAID", note: `Excess advance handed back — ${admission.admissionNumber}`, admissionId: id, createdById: user.id } });
        return { admission, audit: { refund: -bill.hospitalBalance, method }, message: `${pkr(-bill.hospitalBalance)} handed back.` };
      }

      if (action === "SET_DOCTOR_VISIT") {
        requireStatus(admission, ["ADMITTED"], "Reopen the invoice to change the doctor visits.");
        const dayId = Number(body?.dayId);
        const visited = Boolean(body?.visited);
        const day = await transaction.admissionDay.findFirst({ where: { id: dayId, admissionId: id } });
        if (!day) throw new Error("Day not found on this admission.");
        await transaction.admissionDay.update({ where: { id: dayId }, data: { doctorVisited: visited } });
        return { admission, audit: { dayId, date: dayKeyOf(day.chargeDate), visited }, message: visited ? "Marked: doctor arrived." : "Marked: doctor did not arrive — no doctor fee for that day." };
      }

      if (action === "ADD_CHARGE") {
        requireStatus(admission, ["ADMITTED"], "Reopen the invoice to add charges.");
        const description = text(body?.description);
        const value = amount(body?.amount);
        if (!description || !Number.isFinite(value) || value <= 0) throw new Error("Enter what the charge is for and its amount.");
        await transaction.admissionCharge.create({ data: { admissionId: id, description, amount: value, createdById: user.id } });
        return { admission, audit: { description, amount: value }, message: `${description} added (${pkr(value)}).` };
      }

      if (action === "REMOVE_CHARGE") {
        requireStatus(admission, ["ADMITTED"], "Reopen the invoice to remove charges.");
        const chargeId = Number(body?.chargeId);
        const charge = await transaction.admissionCharge.findFirst({ where: { id: chargeId, admissionId: id } });
        if (!charge) throw new Error("Charge not found on this admission.");
        await transaction.admissionCharge.delete({ where: { id: chargeId } });
        return { admission, audit: { removedCharge: charge.description, amount: Number(charge.amount) }, message: `${charge.description} removed.` };
      }

      if (action === "ADD_OPERATION") {
        requireStatus(admission, ["ADMITTED"], "Operations can only be added while the patient is admitted.");
        const doctorId = Number(body?.doctorId);
        const procedureName = text(body?.procedureName);
        const procedureAt = text(body?.procedureAt);
        const fees = { theaterFee: amount(body?.theaterFee), doctorFee: amount(body?.doctorFee), anesthesiaFee: amount(body?.anesthesiaFee), hospitalFee: amount(body?.hospitalFee) };
        if (!Number.isInteger(doctorId) || !procedureName) throw new Error("Select the operating doctor and enter the procedure.");
        if (Object.values(fees).some((v) => !Number.isFinite(v))) throw new Error("Operation charges must be zero or more.");
        if (procedureAt && Number.isNaN(Date.parse(procedureAt))) throw new Error("Enter a valid procedure date and time.");
        const doctor = await transaction.doctor.findFirst({ where: { id: doctorId, active: true } });
        if (!doctor) throw new Error("Doctor not found.");
        const dateKey = localDateKey(new Date()).replaceAll("-", "");
        const sequenceKey = `OT:${dateKey}`;
        const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
        const caseNumber = `OT-${dateKey}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
        // The room is already charged daily on the admission, and medicine comes from the store,
        // so those parts of the OT package stay at zero here.
        await transaction.otCase.create({
          data: {
            caseNumber,
            patientId: admission.patientId,
            doctorId,
            roomLabel: admission.roomLabel,
            admissionDate: new Date(),
            procedureAt: procedureAt ? new Date(procedureAt) : null,
            ...fees,
            total: round2(fees.theaterFee + fees.doctorFee + fees.anesthesiaFee + fees.hospitalFee),
            procedureName,
            diagnosis: admission.diagnosis,
            admissionId: id,
            createdById: user.id,
          },
        });
        return { admission, audit: { caseNumber, procedureName, doctorId, ...fees }, message: `Operation ${caseNumber} added to the bill.` };
      }

      if (action === "ORDER_TESTS") {
        requireStatus(admission, ["ADMITTED"], "Tests can only be ordered while the patient is admitted (reopen the invoice first).");
        const serviceModule = text(body?.module).toUpperCase();
        const itemIds: number[] = Array.isArray(body?.itemIds) ? body.itemIds.map(Number).filter(Number.isInteger) : [];
        if (!testModules.includes(serviceModule) || itemIds.length === 0) throw new Error("Select the tests to order.");
        const items = await transaction.diagnosticCatalogItem.findMany({ where: { id: { in: itemIds }, module: serviceModule, active: true } });
        if (items.length !== new Set(itemIds).size) throw new Error("One or more selected tests are unavailable.");
        const total = round2(items.reduce((sum, item) => sum + Number(item.price), 0));
        // Same numbering as the OPD tests counter, so the lab sees one sequence per module and day.
        const dateKey = localDateKey(new Date());
        const sequenceKey = `DIAGNOSTIC:${serviceModule}:${dateKey}`;
        const sequence = await transaction.dailySequence.upsert({ where: { sequenceKey }, create: { sequenceKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
        const moduleToken = sequence.nextValue - 1;
        const receiptNumber = `${serviceModule.slice(0, 3)}-${dateKey.replaceAll("-", "")}-${String(moduleToken).padStart(4, "0")}`;
        // No payment here: the tests go on this admission's hospital bill. The attending doctor is the
        // referring doctor, exactly as the OPD doctor is for counter tests.
        await transaction.diagnosticReceipt.create({
          data: {
            receiptNumber,
            module: serviceModule,
            moduleToken,
            admissionId: id,
            patientId: admission.patientId,
            doctorId: admission.doctorId,
            subtotal: total,
            total,
            createdById: user.id,
            items: { create: items.map((item) => ({ catalogItemId: item.id, nameAtSale: item.name, priceAtSale: item.price })) },
          },
        });
        return { admission, audit: { receiptNumber, module: serviceModule, tests: items.map((i) => i.name), total }, message: `${receiptNumber}: ${items.length} test${items.length === 1 ? "" : "s"} sent to the lab (${pkr(total)} added to the bill).` };
      }

      if (action === "CANCEL_TEST") {
        requireStatus(admission, ["ADMITTED"], "Reopen the invoice to cancel a test.");
        const receiptId = Number(body?.receiptId);
        const reason = text(body?.reason);
        if (!reason) throw new Error("Enter why the test is being cancelled.");
        const receipt = await transaction.diagnosticReceipt.findFirst({ where: { id: receiptId, admissionId: id }, include: { items: { include: { resultValues: true } } } });
        if (!receipt) throw new Error("Test not found on this admission.");
        if (receipt.status !== "PAID") throw new Error("This test is already cancelled.");
        if (receipt.items.some((item) => item.result || item.resultValues.length > 0)) throw new Error("The lab has already entered results for this test; it cannot be cancelled.");
        await transaction.diagnosticReceipt.update({ where: { id: receiptId }, data: { status: "CANCELLED" } });
        return { admission, audit: { cancelledTest: receipt.receiptNumber, reason }, message: `${receipt.receiptNumber} cancelled and taken off the bill.` };
      }

      if (action === "UPDATE_STAY") {
        requireStatus(admission, ["ADMITTED"], "Reopen the invoice to change the room, doctor or rates.");
        const roomBedId = body?.roomBedId ? Number(body.roomBedId) : null;
        const manualLabel = text(body?.roomLabel);
        const doctorId = Number(body?.doctorId);
        const rates = { dailyRoomRate: amount(body?.dailyRoomRate), dailyDoctorFee: amount(body?.dailyDoctorFee), dailyTechnicianFee: amount(body?.dailyTechnicianFee) };
        if (Object.values(rates).some((v) => !Number.isFinite(v))) throw new Error("Daily charges must be zero or more.");
        if (roomBedId === null && !manualLabel) throw new Error("Select a room/bed, or enter the room manually.");
        const doctor = await transaction.doctor.findFirst({ where: { id: doctorId, active: true } });
        if (!doctor) throw new Error("Select the attending doctor.");
        const roomLabel = roomBedId !== null ? (await checkBed(transaction, admission, roomBedId, admission.category)).name : manualLabel;
        const updated = await transaction.admission.update({
          where: { id },
          data: { roomBedId, roomLabel, doctorId, ...rates, diagnosis: text(body?.diagnosis) || null, notes: text(body?.notes) || null },
        });
        // Days already charged keep their rates. "Also the current day" corrects the latest charged
        // day too (e.g. a wrong rate fixed straight after admitting); otherwise the change starts with
        // the next day. The latest row, not today's date: a stay under 24 hours that crossed midnight
        // is still charged on its first date.
        if (body?.applyToday) {
          const current = await transaction.admissionDay.findFirst({ where: { admissionId: id }, orderBy: { chargeDate: "desc" } });
          if (current) {
            await transaction.admissionDay.update({
              where: { id: current.id },
              data: { roomLabel, roomRate: rates.dailyRoomRate, doctorId, doctorFee: rates.dailyDoctorFee, technicianFee: rates.dailyTechnicianFee },
            });
          }
        }
        return { admission: updated, audit: { roomBedId, roomLabel, doctorId, ...rates, applyToday: Boolean(body?.applyToday) }, message: "Stay details updated." };
      }

      if (action === "INVOICE") {
        requireStatus(admission, ["ADMITTED"], "Only an admitted patient can be invoiced.");
        // Charges stop at this moment: the day count is fixed using the invoice time.
        const invoiced = await transaction.admission.update({ where: { id }, data: { status: "INVOICED", invoicedAt: new Date() } });
        await accrueAdmissionDays(transaction, invoiced);
        return { admission: invoiced, audit: { invoicedAt: invoiced.invoicedAt }, message: "Final invoice generated. Daily charges have stopped." };
      }

      if (action === "REOPEN") {
        requireStatus(admission, ["INVOICED"], "Only an invoiced admission can be reopened.");
        const reopened = await transaction.admission.update({ where: { id }, data: { status: "ADMITTED", invoicedAt: null } });
        await accrueAdmissionDays(transaction, reopened);
        return { admission: reopened, audit: {}, message: "Invoice reopened. Daily charges continue." };
      }

      if (action === "DISCHARGE") {
        requireStatus(admission, ["INVOICED"], "Generate the final invoice before discharging.");
        const { full, bill } = await fullBill(transaction, id);
        if (bill.hospitalBalance > 0.005) throw new Error(`${pkr(bill.hospitalBalance)} is still due on the hospital bill. Collect it before discharging.`);
        if (bill.hospitalBalance < -0.005) throw new Error(`The patient paid ${pkr(-bill.hospitalBalance)} more than the bill. Hand it back (Refund excess) before discharging.`);
        if (bill.storeOwed > 0.005) throw new Error(`The medical store has not yet been paid ${pkr(bill.storeOwed)} for medicines. The store must mark it paid before discharge.`);
        const now = new Date();
        const discharged = await transaction.admission.update({ where: { id }, data: { status: "DISCHARGED", dischargedAt: now } });
        // Operations done during the stay are finished with it (the surgeon's share counts from here).
        await transaction.otCase.updateMany({ where: { admissionId: id, status: { notIn: ["DISCHARGED", "CANCELLED"] } }, data: { status: "DISCHARGED", dischargeDate: now } });
        // Credit sales whose medicine was all returned owe nothing; close them too.
        const zeroOwed = bill.medicines.filter((m) => m.sale.creditStatus === "UNSETTLED" && m.owed <= 0.005).map((m) => m.sale.id);
        if (zeroOwed.length) await transaction.medicineSale.updateMany({ where: { id: { in: zeroOwed } }, data: { creditStatus: "SETTLED", settledAt: now } });
        return { admission: discharged, audit: { hospitalTotal: bill.hospitalTotal, storeTotal: bill.storeTotal, days: full.days.length }, message: "Patient discharged." };
      }

      // CANCEL — for an admission made by mistake, before anything was billed against it.
      requireStatus(admission, ["ADMITTED"], "Only an admitted patient can be cancelled.");
      const reason = text(body?.reason);
      if (!reason) throw new Error("Enter why this admission is being cancelled.");
      const [payments, sales, operations, tests] = await Promise.all([
        transaction.payment.count({ where: { admissionId: id } }),
        transaction.medicineSale.count({ where: { admissionId: id } }),
        transaction.otCase.count({ where: { admissionId: id, status: { not: "CANCELLED" } } }),
        transaction.diagnosticReceipt.count({ where: { admissionId: id, status: "PAID" } }),
      ]);
      if (payments || sales || operations || tests) throw new Error("This admission already has payments, medicines, tests or operations. It cannot be cancelled — invoice and discharge it instead.");
      const cancelled = await transaction.admission.update({ where: { id }, data: { status: "CANCELLED" } });
      return { admission: cancelled, audit: { reason }, message: "Admission cancelled." };
    });

    await db.auditLog.create({
      data: {
        action: action === "CANCEL" ? "CANCEL" : action === "REFUND" ? "REFUND" : "UPDATE",
        entity: "Admission",
        entityId: String(id),
        userId: user.id,
        reason: action === "CANCEL" ? text(body?.reason) : null,
        afterJson: JSON.stringify({ action, admissionNumber: result.admission.admissionNumber, ...result.audit }),
      },
    });
    return NextResponse.json({ message: result.message, admission: await loadSerialized(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the admission." }, { status: 409 });
  }
}
