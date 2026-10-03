// Standalone regression check for the salary payment-cycle logic (due date, status,
// and first-cycle proration). This is deliberately not named *.test.ts: hosting build tools treat that name as a sign of a test runner (vitest/jest) and fail when one is missing. It runs
// as a plain script against the real exported function — not a reimplementation of it.
//
// Run with:  npx tsx scripts/payment-cycle-check.ts

import { getPaymentCycleInfo, type PaymentCycleInfo } from "../lib/payment-cycle";

let failures = 0;
let passed = 0;

function iso(y: number, m1to12: number, d: number) {
  return new Date(Date.UTC(y, m1to12 - 1, d)).toISOString();
}

function check(name: string, actual: PaymentCycleInfo, expected: Partial<PaymentCycleInfo>) {
  const problems: string[] = [];

  if (expected.status !== undefined && actual.status !== expected.status) {
    problems.push(`status: expected ${expected.status}, got ${actual.status}`);
  }
  if (expected.dueDate !== undefined) {
    const expectedTime = expected.dueDate === null ? null : expected.dueDate.getTime();
    const actualTime = actual.dueDate === null ? null : actual.dueDate.getTime();
    if (expectedTime !== actualTime) {
      problems.push(`dueDate: expected ${expected.dueDate?.toDateString() ?? "null"}, got ${actual.dueDate?.toDateString() ?? "null"}`);
    }
  }
  if (expected.daysUntilDue !== undefined && actual.daysUntilDue !== expected.daysUntilDue) {
    problems.push(`daysUntilDue: expected ${expected.daysUntilDue}, got ${actual.daysUntilDue}`);
  }
  if (expected.amountDue !== undefined) {
    const closeEnough = expected.amountDue === null
      ? actual.amountDue === null
      : actual.amountDue !== null && Math.abs(actual.amountDue - expected.amountDue) < 0.01;
    if (!closeEnough) problems.push(`amountDue: expected ${expected.amountDue}, got ${actual.amountDue}`);
  }
  if (expected.proration !== undefined) {
    const same = JSON.stringify(actual.proration) === JSON.stringify(expected.proration);
    if (!same) problems.push(`proration: expected ${JSON.stringify(expected.proration)}, got ${JSON.stringify(actual.proration)}`);
  }

  if (problems.length === 0) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}`);
    for (const p of problems) console.log(`          ${p}`);
  }
}

const now = new Date(2026, 8, 24); // "today" for most cases: 24 Sep 2026

// A. No payment cycle configured at all.
check(
  "A. paymentCycleDay not set -> not_set, everything else null",
  getPaymentCycleInfo(null, 30000, iso(2020, 1, 1), null, now),
  { status: "not_set", dueDate: null, daysUntilDue: null, amountDue: null, proration: null }
);

// B. Long-tenured employee, already paid this cycle (on its payday).
check(
  "B. Long-tenured, paid on this cycle's payday -> paid, full salary",
  getPaymentCycleInfo(20, 30000, iso(2020, 1, 1), iso(2026, 9, 20), now),
  { status: "paid", dueDate: new Date(2026, 8, 20), daysUntilDue: 0, amountDue: 30000, proration: null }
);

// B2. The reported bug: new hire paid early, in the month before their first payday.
check(
  "B2. Joined Sep10 (payday=10th), paid Sep30 -> first payday Oct10 is paid",
  getPaymentCycleInfo(10, 20000, iso(2026, 9, 10), iso(2026, 9, 30), new Date(2026, 8, 30)),
  { status: "paid", dueDate: new Date(2026, 9, 10) }
);

// B2b. A small early payment before the first payday doesn't count as that payday's salary.
check(
  "B2b. Joined Sep1 (payday=1st), paid only 1,612.90 on Sep24 -> Oct1 still due, full 50,000",
  getPaymentCycleInfo(1, 50000, iso(2026, 9, 1), iso(2026, 9, 24), new Date(2026, 8, 30), 1612.9),
  { status: "upcoming", dueDate: new Date(2026, 9, 1), daysUntilDue: 1, amountDue: 50000 }
);

// B2c. A full early payment before the first payday does count (the Noman khan case, with amount).
check(
  "B2c. Joined Sep10 (payday=10th), paid full 20,000 on Sep30 -> Oct10 paid",
  getPaymentCycleInfo(10, 20000, iso(2026, 9, 10), iso(2026, 9, 30), new Date(2026, 8, 30), 20000),
  { status: "paid", dueDate: new Date(2026, 9, 10) }
);

// B3. A late payment settles the payday it was late for, not the next one.
check(
  "B3. Payday=28th, Sep salary paid late on Oct3 -> Oct28 still upcoming",
  getPaymentCycleInfo(28, 30000, iso(2020, 1, 1), iso(2026, 10, 3), new Date(2026, 9, 5)),
  { status: "upcoming", dueDate: new Date(2026, 9, 28), daysUntilDue: 23 }
);

// B4. Paid on the payday itself, next month it's due again.
check(
  "B4. Paid Oct10 on its payday -> Nov10 upcoming in November",
  getPaymentCycleInfo(10, 20000, iso(2026, 9, 10), iso(2026, 10, 10), new Date(2026, 10, 2)),
  { status: "upcoming", dueDate: new Date(2026, 10, 10), daysUntilDue: 8, amountDue: 20000 }
);

// C. Long-tenured, paid last month (not this one), due date upcoming -> full salary, never prorated again.
check(
  "C. Long-tenured, not yet paid this month, due in 4 days -> upcoming, full salary",
  getPaymentCycleInfo(28, 30000, iso(2020, 1, 1), iso(2026, 8, 28), now),
  { status: "upcoming", dueDate: new Date(2026, 8, 28), daysUntilDue: 4, amountDue: 30000, proration: null }
);

// D. Due exactly today.
check(
  "D. Due date is today -> due_today",
  getPaymentCycleInfo(24, 30000, iso(2020, 1, 1), iso(2026, 8, 24), now),
  { status: "due_today", dueDate: new Date(2026, 8, 24), daysUntilDue: 0, amountDue: 30000 }
);

// E. Overdue.
check(
  "E. Due date already passed -> overdue",
  getPaymentCycleInfo(20, 30000, iso(2020, 1, 1), iso(2026, 8, 20), now),
  { status: "overdue", dueDate: new Date(2026, 8, 20), daysUntilDue: -4, amountDue: 30000 }
);

// F. New hire, joined partway through the cycle now due (the original "Ali" bug report).
check(
  "F. New hire joined mid-cycle (Sep15, payday=1st) -> prorated 17/30",
  getPaymentCycleInfo(1, 30000, iso(2026, 9, 15), null, now),
  { status: "upcoming", dueDate: new Date(2026, 9, 1), daysUntilDue: 7, amountDue: 17000, proration: { daysWorked: 17, totalDaysInCycle: 30 } }
);

// G. New hire joined the day right after the previous cycle's due date -> worked the full cycle, no proration.
check(
  "G. New hire joined day after previous due date (Aug11, payday=10th) -> full cycle, no proration",
  getPaymentCycleInfo(10, 30000, iso(2026, 8, 11), null, now),
  { status: "overdue", dueDate: new Date(2026, 8, 10), daysUntilDue: -14, amountDue: 30000, proration: null }
);

// H. New hire joined exactly ON the payday itself -> that payday isn't a completed cycle; rolls to next month, full salary.
check(
  "H. New hire joined exactly on this month's payday (Sep10, payday=10th) -> rolls to Oct10, full salary",
  getPaymentCycleInfo(10, 30000, iso(2026, 9, 10), null, now),
  { status: "upcoming", dueDate: new Date(2026, 9, 10), daysUntilDue: 16, amountDue: 30000, proration: null }
);

// I. New hire joined exactly ON the previous cycle's boundary date -> worked that whole cycle, full salary (not overdue-and-prorated).
check(
  "I. New hire joined exactly on previous due date (Aug10, payday=10th) -> full cycle, no proration",
  getPaymentCycleInfo(10, 30000, iso(2026, 8, 10), null, now),
  { status: "overdue", dueDate: new Date(2026, 8, 10), daysUntilDue: -14, amountDue: 30000, proration: null }
);

// J. Already paid once before -> never prorates again, even though the join date looks "mid-cycle".
check(
  "J. Already paid once before -> no proration on later cycles",
  getPaymentCycleInfo(28, 30000, iso(2026, 9, 15), iso(2026, 9, 28), new Date(2026, 9, 24)),
  { status: "upcoming", dueDate: new Date(2026, 9, 28), daysUntilDue: 4, amountDue: 30000, proration: null }
);

// K. Cycle day 31 clamps in a non-leap February.
check(
  "K. Cycle day 31 in Feb 2026 (28 days, not leap) -> clamps to Feb 28",
  getPaymentCycleInfo(31, 30000, iso(2020, 1, 1), iso(2026, 1, 31), new Date(2026, 1, 20)),
  { status: "upcoming", dueDate: new Date(2026, 1, 28), daysUntilDue: 8, amountDue: 30000 }
);

// L. Cycle day 31 clamps in a leap February.
check(
  "L. Cycle day 31 in Feb 2028 (29 days, leap year) -> clamps to Feb 29",
  getPaymentCycleInfo(31, 30000, iso(2020, 1, 1), iso(2028, 1, 31), new Date(2028, 1, 20)),
  { status: "upcoming", dueDate: new Date(2028, 1, 29), daysUntilDue: 9, amountDue: 30000 }
);

// M. Cycle day 31 clamps in a 30-day month.
check(
  "M. Cycle day 31 in Sep 2026 (30 days) -> clamps to Sep 30",
  getPaymentCycleInfo(31, 30000, iso(2020, 1, 1), iso(2026, 8, 31), new Date(2026, 8, 20)),
  { status: "upcoming", dueDate: new Date(2026, 8, 30), daysUntilDue: 10, amountDue: 30000 }
);

// N. No joining date on file at all -> evaluated plainly against the current month, never prorated.
check(
  "N. No joiningDate on file -> plain current-month evaluation, no proration",
  getPaymentCycleInfo(5, 30000, null, null, now),
  { status: "overdue", dueDate: new Date(2026, 8, 5), daysUntilDue: -19, amountDue: 30000, proration: null }
);

// O. Joining date is in the future (hired, but start date hasn't arrived yet) -> rolls forward
// multiple months to their real first payday, and still prorates that first partial cycle.
check(
  "O. Future joining date -> rolls forward several months to the real first payday, prorated",
  getPaymentCycleInfo(10, 30000, iso(2026, 12, 1), null, now),
  { status: "upcoming", dueDate: new Date(2026, 11, 10), daysUntilDue: 77, amountDue: 10000, proration: { daysWorked: 10, totalDaysInCycle: 30 } }
);

// P. Proration rounds to the nearest cent without drifting.
check(
  "P. Proration amount rounds cleanly to 2 decimal places",
  getPaymentCycleInfo(1, 100000, iso(2026, 9, 10), null, new Date(2026, 8, 15)),
  { amountDue: 73333.33, proration: { daysWorked: 22, totalDaysInCycle: 30 } }
);

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
