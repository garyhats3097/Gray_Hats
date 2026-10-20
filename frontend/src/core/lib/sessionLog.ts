/**
 * Failed / rejected actions never reach the chain, so they have no events. We keep
 * them in this browser only (localStorage) so the Activity page can show them,
 * clearly labelled as "this browser".
 */
export type FailedAction = { id: string; label: string; module: string; message: string; account: string; time: number };

const KEY = "modular-defi:failed-actions";
const listeners = new Set<() => void>();
// Cached snapshot: React's useSyncExternalStore needs the same array back until something changes.
let cache: FailedAction[] | null = null;

export function readFailures(): FailedAction[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as FailedAction[];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordFailure(a: Omit<FailedAction, "id" | "time">) {
  try {
    const next = [{ ...a, id: crypto.randomUUID(), time: Math.floor(Date.now() / 1000) }, ...readFailures()].slice(0, 50);
    cache = next;
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — skip silently
  }
  listeners.forEach((l) => l());
}

export function subscribeFailures(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
