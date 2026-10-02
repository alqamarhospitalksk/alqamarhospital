// MariaDB's `@db.Date` columns (expenseDate, visitDate, saleDate, etc.) store a plain
// calendar date with no time or timezone. When Prisma's MariaDB adapter binds a JS `Date`
// object as a query parameter against one of these columns, the comparison happens using
// the UTC calendar date of that instant — not its local calendar date.
//
// For any timezone AHEAD of UTC (e.g. Pakistan, UTC+5), a "local midnight" boundary built
// with `new Date(year, month, day)` represents an instant that's still the *previous*
// evening in UTC. That silently shifts every date-range query on a `@db.Date` column back
// by one day: "today" 's upper bound ends up meaning "today" in UTC terms instead of
// "tomorrow", which excludes anything dated today from the range entirely — verified
// directly against the database: a row stored as `2026-09-24` failed to match
// `gte: <local midnight Sep 24>, lt: <local midnight Sep 25>` until the boundaries were
// re-anchored to UTC midnight for the same calendar date.
//
// Fix: whenever a boundary Date is used to query a `@db.Date` column, re-anchor it to UTC
// midnight for the same Y/M/D — its local calendar date is already correct, this just
// stops MariaDB's UTC-based comparison from re-interpreting it as a different day.
// DateTime columns (createdAt, etc.) are real timestamps and don't need this — only use it
// for `@db.Date` fields.
export function toDateColumnBoundary(localAnchoredDate: Date): Date {
  return new Date(Date.UTC(localAnchoredDate.getFullYear(), localAnchoredDate.getMonth(), localAnchoredDate.getDate()));
}
