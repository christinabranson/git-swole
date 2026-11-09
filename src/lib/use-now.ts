"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock as an external store. Using useSyncExternalStore rather than
 * useState+useEffect keeps the server snapshot null (so nothing hydrates
 * mismatched) without kicking off a cascading render on mount.
 */
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      current = Date.now();
      for (const notify of listeners) {
        notify();
      }
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Milliseconds since the epoch, ticking once a second. Null during SSR. */
export function useNowMs(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/**
 * Today's date, stable until the local day rolls over. Screens that only care
 * about the date use this so they do not re-render once a second.
 */
export function useToday(): Date | null {
  const stamp = useSyncExternalStore(
    subscribe,
    () => new Date(current).toDateString(),
    () => null,
  );
  return stamp ? new Date(stamp) : null;
}
