import { lazy, type ComponentType } from "react";

type Task = () => Promise<unknown>;
const pending: Task[] = [];
let running = false;

/** Give the current view time to paint before preparing optional code/data. */
export function scheduleBackgroundTask(task: () => void, delay = 1200) {
  let idleId: number | undefined;
  const timer = window.setTimeout(() => {
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(task);
    } else {
      task();
    }
  }, delay);
  return () => {
    window.clearTimeout(timer);
    if (idleId !== undefined) window.cancelIdleCallback(idleId);
  };
}

function warmNext() {
  if (running || !navigator.onLine) return;
  const task = pending.shift();
  if (!task) return;
  running = true;
  scheduleBackgroundTask(() => {
    if (!navigator.onLine) { pending.unshift(task); running = false; return; }
    // Failed speculative requests must not break the current view or prevent
    // an explicit open/navigation from retrying the import.
    void task().catch(() => undefined).finally(() => { running = false; warmNext(); });
  }, 250);
}

export function warmOptionalCode() {
  warmNext();
}

// Match React.lazy's generic constraint while preserving each component's props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithPreload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let request: Promise<{ default: T }> | undefined;
  const preload = () => request ??= load().catch((error: unknown) => {
    request = undefined;
    throw error;
  });
  pending.push(preload);
  return Object.assign(lazy(preload), { preload });
}
