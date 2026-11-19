import { Base64 } from "convex/values";

// Storage metadata can encode the same 32-byte digest as hex or Base64.
// Never lowercase Base64: its letter case is part of the checksum.
export function storageHashMatches(stored: string, expectedHex: string | undefined) {
  if (!expectedHex || !/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  if (/^[a-f0-9]{64}$/i.test(stored)) return stored.toLowerCase() === expectedHex.toLowerCase();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(stored)) return false;
  const bytes = Base64.toByteArray(stored);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return bytes.length === 32 && hex === expectedHex.toLowerCase();
}
