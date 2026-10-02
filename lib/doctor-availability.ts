export type DoctorAvailability = {
  availabilityDays: number[];
  availabilityFrom: string | null;
  availabilityTo: string | null;
  availability: string | null;
};

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
  const from = schedule.availabilityFrom ? timeToMinutes(schedule.availabilityFrom) : null;
  const to = schedule.availabilityTo ? timeToMinutes(schedule.availabilityTo) : null;
  if (from === null || to === null || !schedule.availabilityDays.length) {
    return legacyAvailabilityIsValid(schedule.availability, now);
  }
  const current = now.getHours() * 60 + now.getMinutes();
  return schedule.availabilityDays.includes(now.getDay()) && current >= from && current < to;
}

export function parseAvailabilityDays(value: unknown) {
  if (Array.isArray(value)) return value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6);
  if (typeof value !== "string") return [];
  try {
    return parseAvailabilityDays(JSON.parse(value));
  } catch {
    return [];
  }
}