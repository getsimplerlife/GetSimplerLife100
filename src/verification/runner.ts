import type { CapabilityContract } from "../lib/capability-contract";
import type { VerificationEvidence, VerificationResult, VerificationRunner } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type Runner = VerificationRunner | ((contract: CapabilityContract, credentials: Record<string, unknown>) => Promise<{ httpStatus?: number; response?: unknown }>);

export async function runVerification(
  contract: CapabilityContract,
  adapter: Runner,
  credentials: Record<string, unknown> | undefined,
  options: { timeoutMs?: number; verifiedBy?: string; ttlMs?: number } = {},
): Promise<VerificationResult> {
  const providerId = contract.providerId ?? "unknown";
  const timestamp = new Date().toISOString();
  const evidence: VerificationEvidence = { capabilityId: contract.capabilityId, providerId, timestamp, verifiedBy: options.verifiedBy ?? "verification-runner" };
  const expiresAt = new Date(Date.now() + (options.ttlMs ?? DEFAULT_TTL_MS)).toISOString();
  if (!credentials || Object.keys(credentials).length === 0) {
    evidence.errorMessage = "Provider credentials are required";
    return { capabilityId: contract.capabilityId, status: "failed", evidence, expiresAt };
  }
  try {
    const verify = typeof adapter === "function" ? adapter : adapter.verify.bind(adapter);
    const result = await withTimeout(verify(contract, credentials), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    evidence.httpStatus = result.httpStatus;
    evidence.responseShape = describeShape(result.response);
    return { capabilityId: contract.capabilityId, status: "verified", evidence, expiresAt };
  } catch (error) {
    evidence.errorMessage = error instanceof Error ? error.message : String(error);
    return { capabilityId: contract.capabilityId, status: "failed", evidence, expiresAt };
  }
}

function describeShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Verification timed out")), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
