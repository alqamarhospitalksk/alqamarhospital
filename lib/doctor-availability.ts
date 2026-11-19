// Doctor duty schedule. Shared by the API routes and the client pages (no server-only imports here).
//
// Each weekday has its own hours, stored as JSON in `doctors.availability_schedule`:
// [{ "day": 1, "from": "09:00", "to": "17:00" }, ...]. Days use JavaScript's numbering (0 = Sunday).
// Doctors saved before per-day hours existed have an empty schedule; for them the old columns
// (`availabilityDays` + one `availabilityFrom`/`availabilityTo` for every day) are used instead.

export type DaySchedule = { day: number; from: string; to: string };

export type DoctorAvailability = {
  availabilitySchedule: DaySchedule[];
  availability: string | null;
};

type StoredAvailability = {
  availabilitySchedule?: unknown;
  availabilityDays?: unknown;
  availabilityFrom?: string | null;
  availabilityTo?: string | null;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isValidTime = (value: unknown): value is string => typeof value === "string" && TIME_PATTERN.test(value);

// Monday first, the way the clinic reads a week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEK_DAYS_MONDAY_FIRST = WEEK_ORDER;

const weekPosition = (day: number) => WEEK_ORDER.indexOf(day);

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function legacyAvailabilityIsValid(availability: string | null, now: Date) {
  if (!availability) return true;
  const tokens = availability.match(/\d{1,2}:\d{2}\s*[AP]M/gi);
  if (!tokens || tokens.length < 2) return true;
  const toMinutes = (token: string) => {
    const [timePart, meridiem] = token.trim().toUpperCase().split(/\s+/);
    const [hours, minutes] = timePart.split(":").map(Number);
    return ((hours % 12) + (meridiem === "PM" ? 12 : 0)) * 60 + minutes;
  };
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= toMinutes(tokens[0]) && current < toMinutes(tokens[1]);
}

export function isDoctorAvailable(schedule: DoctorAvailability, now = new Date()) {
  if (!schedule.availabilitySchedule.length) return legacyAvailabilityIsValid(schedule.availability, now);
  const today = schedule.availabilitySchedule.find((entry) => entry.day === now.getDay());
  if (!today) return false;
  const from = timeToMinutes(today.from);
  const to = timeToMinutes(today.to);
  if (from === null || to === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= from && current < to;
}

export function parseAvailabilityDays(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6);
  if (typeof value !== "string") return [];
  try {
    return parseAvailabilityDays(JSON.parse(value));
  } catch {
    return [];
  }
}

// Reads a schedule from a request body or the stored JSON. Entries with a bad day or time are dropped
// (validateSchedule reports them for input); one entry per day, Monday first.
export function parseSchedule(value: unknown): DaySchedule[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const byDay = new Map<number, DaySchedule>();
  for (const item of list) {
    const day = Number(item?.day);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !isValidTime(item?.from) || !isValidTime(item?.to)) continue;
    byDay.set(day, { day, from: item.from, to: item.to });
  }
  return [...byDay.values()].sort((a, b) => weekPosition(a.day) - weekPosition(b.day));
}

// Problem with a schedule typed into the doctor form, as a sentence for staff, or null when it is fine.
export function scheduleProblem(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return "Turn on at least one day the doctor is available.";
  for (const item of value) {
    const day = Number(item?.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) return "The availability has an unknown day.";
    if (!isValidTime(item?.from) || !isValidTime(item?.to)) return `Enter both times for ${WEEKDAY_NAMES[day]}.`;
    if (item.from >= item.to) return `On ${WEEKDAY_NAMES[day]} the end time must be after the start time.`;
  }
  return null;
}

// The schedule a doctor actually has: the per-day one, or the old "same hours on these days" columns.
export function doctorSchedule(doctor: StoredAvailability): DaySchedule[] {
  const schedule = parseSchedule(doctor.availabilitySchedule);
  if (schedule.length) return schedule;
  const days = parseAvailabilityDays(doctor.availabilityDays);
  if (!days.length || !isValidTime(doctor.availabilityFrom) || !isValidTime(doctor.availabilityTo)) return [];
  const from = doctor.availabilityFrom;
  const to = doctor.availabilityTo;
  return parseSchedule(days.map((day) => ({ day, from, to })));
}

// The old columns are still filled so anything reading them keeps working: the days, and the
// earliest start / latest end across the week. `availability` is a readable English summary.
export function legacyColumns(schedule: DaySchedule[]) {
  const froms = schedule.map((entry) => entry.from).sort();
  const tos = schedule.map((entry) => entry.to).sort();
  return {
    availabilitySchedule: JSON.stringify(schedule),
    availabilityDays: JSON.stringify(schedule.map((entry) => entry.day)),
    availabilityFrom: froms[0] ?? null,
    availabilityTo: tos[tos.length - 1] ?? null,
    availability: schedule.length ? formatScheduleLines(schedule).join("; ").slice(0, 500) : null,
  };
}

// "All Days", "Mon - Fri", "Sat & Sun", "Mon, Wed, Fri", "Mon - Thu & Sat".
// Three or more days in a row (Monday-first week) become a range.
export function formatDays(days: number[]) {
  const ordered = [...new Set(days)].filter((day) => day >= 0 && day <= 6).sort((a, b) => weekPosition(a) - weekPosition(b));
  if (ordered.length === 7) return "All Days";
  const runs: number[][] = [];
  for (const day of ordered) {
    const last = runs[runs.length - 1];
    if (last && weekPosition(day) === weekPosition(last[last.length - 1]) + 1) last.push(day);
    else runs.push([day]);
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3 ? [`${SHORT_DAYS[run[0]]} - ${SHORT_DAYS[run[run.length - 1]]}`] : run.map((day) => SHORT_DAYS[day]),
  );
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

// Stored "HH:mm" (24-hour) shown as "3:00 PM".
export function to12Hour(time: string) {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || minute === undefined) return time;
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

// One line per distinct set of hours, e.g. ["Mon - Fri: 9:00 AM - 5:00 PM", "Sat & Sun: 10:00 AM - 2:00 PM"].
export function formatScheduleLines(schedule: DaySchedule[]) {
  const groups = new Map<string, number[]>();
  for (const entry of parseSchedule(schedule)) {
    const key = `${entry.from}-${entry.to}`;
    groups.set(key, [...(groups.get(key) ?? []), entry.day]);
  }
  return [...groups.entries()].map(([key, days]) => {
    const [from, to] = key.split("-");
    return `${formatDays(days)}: ${to12Hour(from)} - ${to12Hour(to)}`;
  });
}
