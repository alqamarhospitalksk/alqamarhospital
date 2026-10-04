"use client";

import { useEffect, useRef } from "react";

type Options = {
  // Pass false to switch polling off (for example until a user is signed in). Default true.
  enabled?: boolean;
  // Run once straight away (default). Pass false when the page already loads its data itself.
  runNow?: boolean;
};

// Repeats `task` every `intervalMs`, without hammering the server:
//  - the next run is scheduled only AFTER the previous one has finished, so slow responses
//    never pile up into overlapping requests;
//  - nothing runs while the browser tab is hidden or minimised; when the tab comes back it
//    refreshes straight away;
//  - after failures it slows down (up to 4x) instead of retrying at full speed.
export function usePolling(task: () => Promise<unknown> | void, intervalMs: number, options: Options = {}) {
  const { enabled = true, runNow = true } = options;
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(run, intervalMs * Math.min(4, 1 + failures));
    };

    async function run() {
      if (cancelled || running) return;
      if (document.visibilityState === "hidden") return; // resumes when the tab becomes visible
      running = true;
      try {
        await taskRef.current();
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
        schedule();
      }
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible" || running) return;
      clearTimeout(timer);
      void run();
    };

    document.addEventListener("visibilitychange", onVisible);
    if (runNow) void run();
    else schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled, runNow]);
}
