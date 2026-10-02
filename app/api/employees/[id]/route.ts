import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

// lastSalaryPayoutAt isn't needed in this response — the page reloads the full list via
// GET /api/employees (which does compute it) right after a successful edit.
function serializeEmployee(employee: {
  id: number; name: string; designation: string; contact: string | null;
  joiningDate: Date | null; monthlySalary: { toString(): string }; paymentCycleDay: number | null; active: boolean;
}) {
  return {
    id: employee.id,
    name: employee.name,
    designation: employee.designation,
    contact: employee.contact,
    joiningDate: employee.joiningDate ? employee.joiningDate.toISOString() : null,
    monthlySalary: employee.monthlySalary.toString(),
    paymentCycleDay: employee.paymentCycleDay,
    active: employee.active,
    lastSalaryPayoutAt: null as string | null,
    lastSalaryPayoutAmount: null as number | null,
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MANAGEMENT") return NextResponse.json({ error: "Management access is required." }, { status: 403 });

  const employeeId = Number((await context.params).id);
  if (!Number.isInteger(employeeId)) return NextResponse.json({ error: "Invalid employee ID." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const name = body?.name === undefined ? undefined : text(body.name);
  const designation = body?.designation === undefined ? undefined : text(body.designation);
  const contact = body?.contact === undefined ? undefined : (text(body.contact) || null);
  const joiningDate = body?.joiningDate === undefined ? undefined : text(body.joiningDate);
  const monthlySalary = body?.monthlySalary === undefined ? undefined : Number(body.monthlySalary);
  const paymentCycleDay = body?.paymentCycleDay === undefined
    ? undefined
    : (body.paymentCycleDay === "" || body.paymentCycleDay === null ? null : Number(body.paymentCycleDay));
  const active = typeof body?.active === "boolean" ? body.active : undefined;

  if (
    (name !== undefined && !name) ||
    (designation !== undefined && !designation) ||
    (monthlySalary !== undefined && (!Number.isFinite(monthlySalary) || monthlySalary < 0)) ||
    (joiningDate !== undefined && joiningDate && Number.isNaN(Date.parse(joiningDate))) ||
    (paymentCycleDay !== undefined && paymentCycleDay !== null && (!Number.isInteger(paymentCycleDay) || paymentCycleDay < 1 || paymentCycleDay > 31))
  ) {
    return NextResponse.json({ error: "Enter valid employee details. Payment cycle day must be between 1 and 31." }, { status: 400 });
  }
  if (contact) {
    const cleanContact = contact.replace(/\D/g, "");
    if (!/^03\d{9}$/.test(cleanContact) || contact.length !== 12) {
      return NextResponse.json({ error: "Invalid mobile number. Expected format: 0300-5676121." }, { status: 400 });
    }
  }

  try {
    const employee = await db.employee.update({
      where: { id: employeeId },
      data: {
        ...(name === undefined ? {} : { name }),
        ...(designation === undefined ? {} : { designation }),
        ...(contact === undefined ? {} : { contact }),
        ...(joiningDate === undefined ? {} : { joiningDate: joiningDate ? new Date(joiningDate) : null }),
        ...(monthlySalary === undefined ? {} : { monthlySalary }),
        ...(paymentCycleDay === undefined ? {} : { paymentCycleDay }),
        ...(active === undefined ? {} : { active }),
      },
    });
    await db.auditLog.create({ data: { action: "UPDATE", entity: "Employee", entityId: String(employee.id), userId: user.id, afterJson: JSON.stringify({ name: employee.name, active: employee.active }) } });
    return NextResponse.json({ employee: serializeEmployee(employee) });
  } catch {
    return NextResponse.json({ error: "Unable to update employee." }, { status: 404 });
  }
}
