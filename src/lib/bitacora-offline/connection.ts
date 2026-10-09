export interface NetworkQuality {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

// Network Information is optional. Without it, use the browser and the actual
// authenticated backend connection rather than guessing bandwidth.
export function isSlowConnection(quality?: NetworkQuality) {
  return Boolean(quality && (
    quality.effectiveType === "slow-2g" || quality.effectiveType === "2g" ||
    (typeof quality.downlink === "number" && quality.downlink < 0.5) ||
    (typeof quality.rtt === "number" && quality.rtt >= 1000)
  ));
}

export function canUseOnlineBitacora(networkOnline: boolean, backendConnected: boolean, quality?: NetworkQuality) {
  return networkOnline && backendConnected && !isSlowConnection(quality);
}

export function browserConnection() {
  return (navigator as Navigator & { connection?: NetworkQuality & EventTarget }).connection;
}
