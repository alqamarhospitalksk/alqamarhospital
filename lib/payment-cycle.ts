// Shared by the Employees page (status badge) and the Payouts page (salary-due list) so
// both agree on exactly the same rule for when a salary is due and how much is owed.

export type PaymentCycleStatus = "not_set" | "paid" | "due_today" | "overdue" | "upcoming";

export type Proration = { daysWorked: number; totalDaysInCycle: number };

export type PaymentCycleInfo = {
  status: PaymentCycleStatus;
  dueDate: Date | null;
  daysUntilDue: number | null; // negative when overdue
  amountDue: number | null; // full monthlySalary, or a prorated share of it for a partial first cycle
  proration: Proration | null;
};

// Not every month has a 31st (or 30th, for day 31 in Feb) — clamp to the month's actual
// last day, the standard "payroll on day 31" convention, rather than skipping or erroring.
export function clampDayToMonth(day: number, year: number, monthIndex0: number) {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  return Math.min(day, daysInMonth);
}

function cycleDueDateFor(paymentCycleDay: number, year: number, monthIndex0: number) {
  return new Date(year, monthIndex0, clampDayToMonth(paymentCycleDay, year, monthIndex0));
}

// `joiningDate` (and other DATE-only DB columns) come back as an ISO string at UTC
// midnight. Comparing that directly against a locally-constructed `new Date(y, m, d)`
// can land on the wrong calendar day depending on the browser's timezone offset, so pull
// out the UTC year/month/day and rebuild a local midnight Date from those — the same
// "pure calendar date" handling already used for expiry dates elsewhere in the app.
function localDateOnly(isoDate: string) {
  const parsed = new Date(isoDate);
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function daysBetween(a: Date, b: Date) {
  const aUTC = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUTC = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUTC - aUTC) / (24 * 60 * 60 * 1000));
}

// One month before/after (year, monthIndex0), handling the December<->January wrap.
function shiftMonth(year: number, monthIndex0: number, delta: 1 | -1) {
  const total = year * 12 + monthIndex0 + delta;
  return { year: Math.floor(total / 12), monthIndex0: ((total % 12) + 12) % 12 };
}

export function getPaymentCycleInfo(
  paymentCycleDay: number | null,
  monthlySalary: number,
  joiningDate: string | null,
  lastSalaryPayoutAt: string | null,
  now: Date = new Date(),
  lastSalaryPayoutAmount: number | null = null
): PaymentCycleInfo {
  if (!paymentCycleDay) return { status: "not_set", dueDate: null, daysUntilDue: null, amountDue: null, proration: null };

  const joined = joiningDate ? localDateOnly(joiningDate) : null;

  // This month's cycle day is only a real payday for this employee if they'd already
  // completed a full cycle by then — i.e. they joined strictly *before* it. If they
  // joined after it, or exactly ON it (day one of employment isn't a completed cycle),
  // that payday isn't theirs — roll forward to the next month's, and the one after
  // that, etc., until we land on their actual next payday. Without this, a new hire's
  // very first payday could resolve to a date before (or the instant) they started,
  // and get reported as already overdue.
  let year = now.getFullYear();
  let month = now.getMonth();
  let dueDate = cycleDueDateFor(paymentCycleDay, year, month);
  for (let guard = 0; joined && joined.getTime() >= dueDate.getTime() && guard < 24; guard++) {
    ({ year, monthIndex0: month } = shiftMonth(year, month, 1));
    dueDate = cycleDueDateFor(paymentCycleDay, year, month);
  }

  // Pay owed for the payday in (payYear, payMonth), as the employee's first-ever payout: when
  // they joined partway through that cycle, they're owed only the days actually worked. The
  // cycle runs from the day after the previous payday through this one.
  const firstPayoutFor = (payYear: number, payMonth: number) => {
    const payday = cycleDueDateFor(paymentCycleDay, payYear, payMonth);
    const prev = shiftMonth(payYear, payMonth, -1);
    const previousPayday = cycleDueDateFor(paymentCycleDay, prev.year, prev.monthIndex0);
    if (joined && joined.getTime() > previousPayday.getTime() && joined.getTime() <= payday.getTime()) {
      const totalDaysInCycle = daysBetween(previousPayday, payday);
      const daysWorked = Math.min(daysBetween(joined, payday) + 1, totalDaysInCycle);
      // Joining the day right after the previous payday means the full cycle was worked.
      if (daysWorked < totalDaysInCycle) {
        return { amount: Math.round((monthlySalary * daysWorked / totalDaysInCycle) * 100) / 100, proration: { daysWorked, totalDaysInCycle } };
      }
    }
    return { amount: monthlySalary, proration: null };
  };

  // A salary payment belongs to the most recent payday on or before the day it was paid —
  // salaries can't be paid before they're due, so a payment always settles a payday that has
  // already arrived (a late one still settles the payday it was late for, not the next).
  // A payment made before the employee's first payday (from before that rule existed) only
  // settles that first payday if it covered the full amount owed for it — a small early
  // payment (an advance, or an old miscalculated partial) leaves the first payday still due.
  let settledPayday: Date | null = null;
  if (lastSalaryPayoutAt) {
    const paidOn = localDateOnly(lastSalaryPayoutAt);
    let settled = cycleDueDateFor(paymentCycleDay, paidOn.getFullYear(), paidOn.getMonth());
    if (settled.getTime() > paidOn.getTime()) {
      const prev = shiftMonth(paidOn.getFullYear(), paidOn.getMonth(), -1);
      settled = cycleDueDateFor(paymentCycleDay, prev.year, prev.monthIndex0);
    }
    settledPayday = settled;
    if (joined) {
      let first = { year: joined.getFullYear(), monthIndex0: joined.getMonth() };
      if (joined.getTime() >= cycleDueDateFor(paymentCycleDay, first.year, first.monthIndex0).getTime()) first = shiftMonth(first.year, first.monthIndex0, 1);
      const firstPayday = cycleDueDateFor(paymentCycleDay, first.year, first.monthIndex0);
      if (settled.getTime() < firstPayday.getTime()) {
        const owed = firstPayoutFor(first.year, first.monthIndex0).amount;
        settledPayday = lastSalaryPayoutAmount == null || lastSalaryPayoutAmount >= owed - 0.01 ? firstPayday : null;
      }
    }
  }

  if (settledPayday && settledPayday.getTime() >= dueDate.getTime()) {
    return { status: "paid", dueDate, daysUntilDue: 0, amountDue: monthlySalary, proration: null };
  }

  // Prorate only the very first payout an employee is ever owed — once any payday has been
  // settled, every later cycle is a normal full month.
  const { amount: amountDue, proration } = settledPayday ? { amount: monthlySalary, proration: null } : firstPayoutFor(year, month);

  const daysUntilDue = daysBetween(now, dueDate);

  if (daysUntilDue === 0) return { status: "due_today", dueDate, daysUntilDue: 0, amountDue, proration };
  if (daysUntilDue < 0) return { status: "overdue", dueDate, daysUntilDue, amountDue, proration };
  return { status: "upcoming", dueDate, daysUntilDue, amountDue, proration };
}
