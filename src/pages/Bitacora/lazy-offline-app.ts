import { lazyWithPreload } from "@/lib/background-preload";

export const OfflineBitacoraApp = lazyWithPreload(() =>
  import("./OfflineBitacoraApp").then(module => ({ default: module.OfflineBitacoraApp })),
);
export const OfflineAccessBlocked = lazyWithPreload(() =>
  import("./OfflineBitacoraApp").then(module => ({ default: module.OfflineAccessBlocked })),
);
