import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { roleError } from "../../../lib/roles";
import { db } from "../../../lib/db";
import { getLastSalaryPayoutMap, type LastSalaryPayout } from "../../../lib/employee-salary";
import { getPaymentCycleInfo } from "../../../lib/payment-cycle";
import { computeDoctorShare } from "../../../lib/doctor-share";
import { toDateColumnBoundary } from "../../../lib/date-range";

const methods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"] as const;
const categories = ["DOCTOR_PAYOUT", "SALARY", "LABORATORY", "ECO", "ECG", "X-RAY", "ULTRASOUND", "OT", "GENERAL"] as const;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function serializeEmployee(
  employee: { id: number; name: string; designation: string; contact: string | null; joiningDate: Date | null; monthlySalary: { toString(): string }; paymentCycleDay: number | null; active: boolean },
  lastSalaryPayout: LastSalaryPayout | null
) {
  return {
    ...employee,
    joiningDate: employee.joiningDate?.toISOString() ?? null,
    monthlySalary: employee.monthlySalary.toString(),
    lastSalaryPayoutAt: lastSalaryPayout ? lastSalaryPayout.paidOn.toISOString() : null,
    lastSalaryPayoutAmount: lastSalaryPayout?.amount ?? null,
  };
}

// Daily/Weekly/Monthly/Custom bound the *earnings* window (Total Collected, Hospital Share,
// Diagnostic Share, Doctor Net Share) for the analytics table. Paid to Date / Balance Due are
// intentionally NOT bounded by this — they're a running accounts-payable ledger, not a period
// figure, so mixing a filtered "earned this week" against a lifetime "paid to date" would
// produce a nonsense balance.
function resolveRange(period: string | null, params: URLSearchParams): { since: Date | null; until: Date | null } {
  const now = new Date();
  if (period === "daily") {
    return { since: new Date(now.getFullYear(), now.getMonth(), now.getDate()), until: null };
  }
  if (period === "weekly") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = start.getDay(); // 0 = Sunday
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diffToMonday);
    return { since: start, until: null };
  }
  if (period === "monthly") {
    return { since: new Date(now.getFullYear(), now.getMonth(), 1), until: null };
  }
  if (period === "custom") {
    const startParam = params.get("start");
    const endParam = params.get("end");
    const since = startParam ? new Date(`${startParam}T00:00:00`) : null;
    const untilRaw = endParam ? new Date(`${endParam}T00:00:00`) : null;
    // Exclusive end — the whole end day is included, not just its midnight instant.
    const until = untilRaw ? new Date(untilRaw.getFullYear(), untilRaw.getMonth(), untilRaw.getDate() + 1) : null;
    return {
      since: since && !Number.isNaN(since.getTime()) ? since : null,
      until: until && !Number.isNaN(until.getTime()) ? until : null,
    };
  }
  return { since: null, until: null };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const denied = roleError(user, ["MANAGEMENT"]);
  if (denied) return denied;

  const url = new URL(request.url);
  const period = url.searchParams.get("period");
  const { since, until } = resolveRange(period, url.searchParams);

  // The Expenses and Payouts pages each ask for their own ledger, for a date range. Without this the
  // list was just "the latest 50 of everything", so older rows silently vanished from the screen.
  const ledger = url.searchParams.get("ledger"); // "expenses" | "payouts" | null (old behaviour)
  const dayParam = (name: string) => {
    const value = url.searchParams.get(name);
    const parsed = value ? new Date(`${value}T00:00:00`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  };
  const ledgerFrom = dayParam("ledgerFrom") ?? (() => { const d = new Date(); d.setDate(d.getDate() - 90); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();
  const ledgerToDay = dayParam("ledgerTo") ?? new Date();
  const ledgerTo = new Date(ledgerToDay.getFullYear(), ledgerToDay.getMonth(), ledgerToDay.getDate() + 1);
  const payoutKinds = ["DOCTOR_PAYOUT", "SALARY"];
  const ledgerWhere = ledger
    ? {
        expenseDate: { gte: toDateColumnBoundary(ledgerFrom), lt: toDateColumnBoundary(ledgerTo) },
        category: ledger === "payouts" ? { in: payoutKinds } : { notIn: payoutKinds },
      }
    : undefined;

  // Fetched unfiltered (lifetime) once, then filtered in memory below for both the
  // period-scoped display columns and the always-lifetime balance calculation —
  // avoids running each query twice against the database.
  const [employees, rawDoctors, expenses, opdVisitsAll, otCasesAll, doctorPayouts, diagnosticReceiptsAll] = await Promise.all([
    db.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.doctor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.expense.findMany({ where: ledgerWhere, orderBy: [{ expenseDate: "desc" }, { id: "desc" }], take: ledger ? 1000 : 50, include: { doctor: true, employee: true } }),
    db.opdVisit.findMany({ select: { doctorId: true, consultationFee: true, visitDate: true } }),
    db.otCase.findMany({ where: { status: "DISCHARGED" }, select: { doctorId: true, doctorFee: true, dischargeDate: true } }),
    db.expense.findMany({ where: { category: "DOCTOR_PAYOUT" }, select: { doctorId: true, amount: true } }),
    db.diagnosticReceipt.findMany({ where: { status: "PAID" }, select: { doctorId: true, module: true, total: true, createdAt: true } }),
  ]);

  const inRange = (d: Date) => (!since || d >= since) && (!until || d < until);
  const bounded = since !== null || until !== null;
  const opdVisits = bounded ? opdVisitsAll.filter((v) => inRange(v.visitDate)) : opdVisitsAll;
  const otCases = bounded ? otCasesAll.filter((c) => c.dischargeDate && inRange(c.dischargeDate)) : otCasesAll;
  const diagnosticReceipts = bounded ? diagnosticReceiptsAll.filter((r) => inRange(r.createdAt)) : diagnosticReceiptsAll;

  const doctorPayoutSummaries = rawDoctors.map((doc) => {
    const { totalCollected, hospitalShare, diagnosticShare, doctorShare } = computeDoctorShare(doc, opdVisits, otCases, diagnosticReceipts);

    const paidToDate = doctorPayouts
      .filter((p) => p.doctorId === doc.id)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    // Balance Due is a running accounts-payable figure — always the doctor's LIFETIME
    // earned share minus lifetime payouts, never the period-filtered share above, so
    // switching Today/Weekly/Monthly/Custom never changes what's actually owed.
    const lifetimeShare = bounded ? computeDoctorShare(doc, opdVisitsAll, otCasesAll, diagnosticReceiptsAll).doctorShare : doctorShare;
    const balanceDue = lifetimeShare - paidToDate;

    return {
      id: doc.id,
      name: doc.name,
      specialization: doc.specialization,
      consultationFee: doc.consultationFee.toString(),
      splitType: doc.hospitalSplitType,
      splitValue: doc.hospitalSplitValue.toString(),
      totalCollected,
      hospitalShare,
      diagnosticShare,
      doctorShare,
      paidToDate,
      balanceDue,
    };
  });

  const lastSalaryPayoutByEmployee = await getLastSalaryPayoutMap(employees.map((e) => e.id));

  return NextResponse.json({
    employees: employees.map((employee) => serializeEmployee(employee, lastSalaryPayoutByEmployee.get(employee.id) ?? null)),
    doctors: rawDoctors.map((d) => ({ id: d.id, name: d.name })),
    doctorSummaries: doctorPayoutSummaries,
    doctorSummaryPeriod: period === "daily" || period === "weekly" || period === "monthly" || period === "custom" ? period : "all",
    expenses: expenses.map((expense) => ({
      ...expense,
      amount: expense.amount.toString(),
      baseAmount: expense.baseAmount?.toString() ?? null,
      incentiveAmount: expense.incentiveAmount?.toString() ?? null,
      deductionAmount: expense.deductionAmount?.toString() ?? null,
      expenseDate: expense.expenseDate.toISOString(),
      doctor: expense.doctor?.name ?? null,
      employee: expense.employee?.name ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const resource = text(body?.resource).toUpperCase();

  if (resource === "EMPLOYEE") {
    const name = text(body?.name);
    const designation = text(body?.designation);
    const contact = text(body?.contact) || null;
    const monthlySalary = Number(body?.monthlySalary);
    const joiningDate = text(body?.joiningDate);
    if (!name || !designation || !Number.isFinite(monthlySalary) || monthlySalary < 0 || joiningDate && Number.isNaN(Date.parse(joiningDate))) return NextResponse.json({ error: "Enter valid employee details." }, { status: 400 });
    if (contact) {
      const cleanContact = contact.replace(/\D/g, "");
      if (!/^03\d{9}$/.test(cleanContact) || contact.length !== 12) {
        return NextResponse.json({ error: "Invalid mobile number. Expected format: 0300-5676121." }, { status: 400 });
      }
    }
    const employee = await db.employee.create({ data: { name, designation, contact, monthlySalary, joiningDate: joiningDate ? new Date(joiningDate) : null } });
    await db.auditLog.create({ data: { action: "CREATE", entity: "Employee", entityId: String(employee.id), userId: user.id, afterJson: JSON.stringify({ name, designation, monthlySalary }) } });
    return NextResponse.json({ employee: serializeEmployee(employee, null) }, { status: 201 });
  }

  if (resource === "EXPENSE") {
    const category = text(body?.category).toUpperCase();
    const method = text(body?.method) || "CASH";
    const note = text(body?.note) || null;
    const doctorId = body?.doctorId ? Number(body.doctorId) : null;
    const employeeId = body?.employeeId ? Number(body.employeeId) : null;
    const expenseDate = text(body?.expenseDate);

    // Salary payouts can optionally be broken into base + incentive - deduction (e.g. a
    // performance bonus, or a deduction for unpaid leave). The final amount is always
    // recomputed here from those parts rather than trusted from the client, so the ledger
    // total can never drift from base+incentive-deduction.
    const numOrNull = (value: unknown) => (value === undefined || value === null || value === "" ? null : Number(value));
    const baseAmount = category === "SALARY" ? numOrNull(body?.baseAmount) : null;
    const incentiveAmount = category === "SALARY" ? numOrNull(body?.incentiveAmount) : null;
    const deductionAmount = category === "SALARY" ? numOrNull(body?.deductionAmount) : null;
    const incentiveNote = category === "SALARY" ? (text(body?.incentiveNote) || null) : null;
    const deductionNote = category === "SALARY" ? (text(body?.deductionNote) || null) : null;

    if (baseAmount !== null && (!Number.isFinite(baseAmount) || baseAmount < 0)) return NextResponse.json({ error: "Enter a valid base salary amount." }, { status: 400 });
    if (incentiveAmount !== null && (!Number.isFinite(incentiveAmount) || incentiveAmount < 0)) return NextResponse.json({ error: "Enter a valid incentive amount." }, { status: 400 });
    if (deductionAmount !== null && (!Number.isFinite(deductionAmount) || deductionAmount < 0)) return NextResponse.json({ error: "Enter a valid deduction amount." }, { status: 400 });

    const amount = baseAmount !== null
      ? Math.round((baseAmount + (incentiveAmount ?? 0) - (deductionAmount ?? 0)) * 100) / 100
      : Number(body?.amount);

    if (!categories.includes(category as (typeof categories)[number]) || !Number.isFinite(amount) || amount <= 0 || !methods.includes(method as (typeof methods)[number]) || expenseDate && Number.isNaN(Date.parse(expenseDate))) return NextResponse.json({ error: "Enter valid expense details — check the deduction isn't bringing the net salary to zero or below." }, { status: 400 });
    if (category === "DOCTOR_PAYOUT" && !Number.isInteger(doctorId)) return NextResponse.json({ error: "Select a doctor for a doctor payout." }, { status: 400 });
    if (category === "SALARY" && !Number.isInteger(employeeId)) return NextResponse.json({ error: "Select an employee for a salary payment." }, { status: 400 });

    // A salary settles one payday. Paying before that payday arrives, or paying a payday that's
    // already settled, would leave the salary-due list out of step with the ledger — refuse both
    // (checked here too, not just by disabling Pay Now, since Record Payout can post salaries).
    if (category === "SALARY" && employeeId !== null) {
      const employee = await db.employee.findUnique({ where: { id: employeeId } });
      if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
      if (employee.paymentCycleDay) {
        const paidOn = expenseDate ? new Date(`${expenseDate.slice(0, 10)}T00:00:00`) : new Date();
        const lastPayout = (await getLastSalaryPayoutMap([employee.id])).get(employee.id) ?? null;
        const cycle = getPaymentCycleInfo(
          employee.paymentCycleDay,
          Number(employee.monthlySalary),
          employee.joiningDate?.toISOString() ?? null,
          lastPayout?.paidOn.toISOString() ?? null,
          paidOn,
          lastPayout?.amount ?? null
        );
        const due = cycle.dueDate?.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        if (cycle.status === "upcoming") {
          return NextResponse.json({ error: `${employee.name}'s salary isn't due until ${due}. It can be paid on or after that date.` }, { status: 400 });
        }
        if (cycle.status === "paid") {
          return NextResponse.json({ error: `${employee.name}'s salary for ${due} has already been paid.` }, { status: 409 });
        }
      }
    }

    const expense = await db.expense.create({
      data: {
        category, amount, method: method as "CASH", note, doctorId, employeeId,
        baseAmount, incentiveAmount, incentiveNote, deductionAmount, deductionNote,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(), createdById: user.id,
      },
    });
    await db.auditLog.create({ data: { action: "CREATE", entity: "Expense", entityId: String(expense.id), userId: user.id, afterJson: JSON.stringify({ category, amount, doctorId, employeeId, baseAmount, incentiveAmount, deductionAmount }) } });
    return NextResponse.json({
      expense: {
        ...expense,
        amount: expense.amount.toString(),
        baseAmount: expense.baseAmount?.toString() ?? null,
        incentiveAmount: expense.incentiveAmount?.toString() ?? null,
        deductionAmount: expense.deductionAmount?.toString() ?? null,
      },
    }, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid finance resource." }, { status: 400 });
}
