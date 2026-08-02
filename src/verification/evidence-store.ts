/**
 * Persistent verification evidence store.
 *
 * The in-memory registry (src/verification/registry.ts) is correct for server
 * lifetime, but batch verification runs execute as one-off processes. This store
 * persists VerificationResult records to a JSON file so evidence survives
 * restarts and can be audited later. No credential values are ever stored.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { VerificationResult } from "./types";

export const DEFAULT_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_EVIDENCE_FILE = join(process.cwd(), ".data", "verification_evidence.json");

export class EvidenceStore {
  constructor(private readonly file: string = DEFAULT_EVIDENCE_FILE) {}

  load(): Record<string, VerificationResult> {
    if (!existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, VerificationResult>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  save(records: Record<string, VerificationResult>): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(records, null, 2), "utf8");
  }

  get(capabilityId: string): VerificationResult | undefined {
    return this.load()[capabilityId];
  }

  record(result: VerificationResult): void {
    const records = this.load();
    records[result.capabilityId] = result;
    this.save(records);
  }

  isVerified(capabilityId: string, now: number = Date.now()): boolean {
    const result = this.get(capabilityId);
    return result?.status === "verified" && new Date(result.expiresAt).getTime() > now;
  }
}

export function isFresh(result: VerificationResult, now: number = Date.now()): boolean {
  return new Date(result.expiresAt).getTime() > now;
}
