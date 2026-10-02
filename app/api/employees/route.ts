import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { getLastSalaryPayoutMap, type LastSalaryPayout } from "../../../lib/employee-salary";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function serializeEmployee(employee: {
  id: number; name: string; designation: string; contact: string | null;
  joiningDate: Date | null; monthlySalary: { toString(): string }; paymentCycleDay: number | null; active: boolean;
}, lastSalaryPayout: LastSalaryPayout | null) {
  return {
    id: employee.id,
    name: employee.name,
    designation: employee.designation,
    contact: employee.contact,
    joiningDate: employee.joiningDate ? employee.joiningDate.toISOString() : null,
    monthlySalary: employee.monthlySalary.toString(),
    paymentCycleDay: employee.paymentCycleDay,
    active: employee.active,
    lastSalaryPayoutAt: lastSalaryPayout ? lastSalaryPayout.paidOn.toISOString() : null,
    lastSalaryPayoutAmount: lastSalaryPayout?.amount ?? null,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
  const employees = await db.employee.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const lastSalaryPayoutByEmployee = await getLastSalaryPayoutMap(employees.map((e) => e.id));

  return NextResponse.json({
    employees: employees.map((employee) => serializeEmployee(employee, lastSalaryPayoutByEmployee.get(employee.id) ?? null)),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = text(body?.name);
  const designation = text(body?.designation);
  const contact = text(body?.contact) || null;
  const joiningDate = text(body?.joiningDate);
  const monthlySalary = Number(body?.monthlySalary);
  const paymentCycleDay = body?.paymentCycleDay === "" || body?.paymentCycleDay === undefined || body?.paymentCycleDay === null
    ? null
    : Number(body.paymentCycleDay);

  if (
    !name ||
    !designation ||
    !Number.isFinite(monthlySalary) ||
    monthlySalary < 0 ||
    (joiningDate && Number.isNaN(Date.parse(joiningDate))) ||
    (paymentCycleDay !== null && (!Number.isInteger(paymentCycleDay) || paymentCycleDay < 1 || paymentCycleDay > 31))
  ) {
    return NextResponse.json({ error: "Enter valid employee details. Payment cycle day must be between 1 and 31." }, { status: 400 });
  }
  if (contact) {
    const cleanContact = contact.replace(/\D/g, "");
    if (!/^03\d{9}$/.test(cleanContact) || contact.length !== 12) {
      return NextResponse.json({ error: "Invalid mobile number. Expected format: 0300-5676121." }, { status: 400 });
    }
  }

  const employee = await db.employee.create({
    data: { name, designation, contact, monthlySalary, paymentCycleDay, joiningDate: joiningDate ? new Date(joiningDate) : null },
  });
  await db.auditLog.create({ data: { action: "CREATE", entity: "Employee", entityId: String(employee.id), userId: user.id, afterJson: JSON.stringify({ name, designation, monthlySalary }) } });
  return NextResponse.json({ employee: serializeEmployee(employee, null) }, { status: 201 });
}
