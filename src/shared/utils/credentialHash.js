import { createHash, timingSafeEqual } from "node:crypto";

export function matchesCredentialHash(value, storedHash) {
  if (typeof value !== "string" || typeof storedHash !== "string" || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  return timingSafeEqual(createHash("sha256").update(value).digest(), Buffer.from(storedHash, "hex"));
}
