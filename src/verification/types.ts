import type { CapabilityContract } from "../lib/capability-contract";

export interface VerificationEvidence {
  capabilityId: string;
  providerId: string;
  timestamp: string;
  httpStatus?: number;
  responseShape?: string;
  /** Compact summary of the adapter response (e.g. created/rolledBack/residue) so evidence stays truthful without storing tokens. */
  responseSummary?: string;
  errorMessage?: string;
  verifiedBy: string;
}

export interface VerificationResult {
  capabilityId: string;
  status: "verified" | "failed" | "pending";
  evidence: VerificationEvidence;
  expiresAt: string;
}

export interface VerificationRunner {
  verify(contract: CapabilityContract, credentials: Record<string, unknown>): Promise<{
    httpStatus?: number;
    response?: unknown;
  }>;
}
