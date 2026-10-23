import { useEffect, useState } from "react";
import { scheduleBackgroundTask } from "@/lib/background-preload";

/** Keep secondary subscriptions off the visible view's initial data path. */
export function useBackgroundReady(ready = true) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!ready || started) return;
    return scheduleBackgroundTask(() => setStarted(true));
  }, [ready, started]);
  return started;
}
