"use client";

import { useRef } from "react";
import { usePolling } from "./use-polling";

// Even with nothing new, a full reload at least this often, so details the version check
// does not cover (a patient's corrected name, for example) still show up.
const FULL_RELOAD_MS = 2 * 60 * 1000;

// Background refresh for the test-results screens (Results, Lab dashboard, Lab upload). Every
// `intervalMs` it asks /api/diagnostics/results/version whether anything changed, and calls
// `reload` only when it did. The full list is heavy (hundreds of receipts with all their result
// values); fetching it every 15 seconds from every open screen kept the hosting busy all day.
export function useResultsPolling(reload: () => Promise<unknown>, intervalMs = 15000) {
  const lastVersion = useRef<string | null>(null);
  const lastReload = useRef(0);

  usePolling(async () => {
    const response = await fetch("/api/diagnostics/results/version");
    if (!response.ok) throw new Error("version check failed"); // usePolling slows down after failures
    const { version } = (await response.json()) as { version: string };
    const first = lastVersion.current === null;
    const changed = !first && version !== lastVersion.current;
    lastVersion.current = version;
    // The first answer is the baseline: the page loaded its list itself just before.
    if (first) {
      lastReload.current = Date.now();
      return;
    }
    if (changed || Date.now() - lastReload.current >= FULL_RELOAD_MS) {
      await reload();
      lastReload.current = Date.now();
    }
  }, intervalMs);
}
