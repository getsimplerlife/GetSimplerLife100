import type { VerificationResult } from "./types";

const evidenceStore = new Map<string, VerificationResult>();

export function recordEvidence(result: VerificationResult): void {
  evidenceStore.set(result.capabilityId, result);
}

export function getEvidence(capabilityId: string): VerificationResult | undefined {
  return evidenceStore.get(capabilityId);
}

export function isVerified(capabilityId: string): boolean {
  const result = evidenceStore.get(capabilityId);
  return result?.status === "verified" && new Date(result.expiresAt).getTime() > Date.now();
}

export function clearEvidence(): void {
  evidenceStore.clear();
}
