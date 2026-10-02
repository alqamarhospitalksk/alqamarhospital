// Slows down password guessing: after MAX_FAILURES wrong passwords for one username
// further attempts are refused for LOCK_MINUTES. Kept in memory — fine for a single Node
// process (the normal setup for this app); it resets when the server restarts.

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const WINDOW_MS = LOCK_MINUTES * 60 * 1000;

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };
const attempts = new Map<string, Entry>();

function clean(now: number) {
  if (attempts.size < 500) return;
  for (const [key, entry] of attempts) {
    if (entry.lockedUntil < now && now - entry.firstFailureAt > WINDOW_MS) attempts.delete(key);
  }
}

// Minutes left on a lock, or 0 if the key may try again.
export function lockedMinutes(...keys: string[]) {
  const now = Date.now();
  let longest = 0;
  for (const key of keys) {
    const entry = attempts.get(key);
    if (entry && entry.lockedUntil > now) longest = Math.max(longest, Math.ceil((entry.lockedUntil - now) / 60000));
  }
  return longest;
}

export function recordFailure(...keys: string[]) {
  const now = Date.now();
  clean(now);
  for (const key of keys) {
    const entry = attempts.get(key);
    if (!entry || now - entry.firstFailureAt > WINDOW_MS) {
      attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
      continue;
    }
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) entry.lockedUntil = now + WINDOW_MS;
  }
}

export function clearFailures(...keys: string[]) {
  for (const key of keys) attempts.delete(key);
}
