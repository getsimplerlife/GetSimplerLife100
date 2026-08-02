#!/usr/bin/env bun
/**
 * Batch provider verification runner (Phase 7).
 *
 * Reads every capability contract in the employee capability matrix for a given
 * provider, loads the provider's stored credentials, and exercises each contract
 * against the live provider API through the verification framework
 * (src/verification/runner.ts) + per-provider adapters (src/verification/adapters/).
 *
 * Usage:
 *   bun run scripts/verify-provider.ts --provider xero
 *   bun run scripts/verify-provider.ts --provider hubspot --tenant mathewortiz97@gmail.com
 *   bun run scripts/verify-provider.ts --provider xero --token /path/to/token.txt
 *   bun run scripts/verify-provider.ts --provider xero --writes      # exercise write contracts
 *
 * Safety: read (understand) contracts always run. Automate (write) contracts fail
 * closed unless --writes is passed. No credentials are printed. Evidence records
 * contain no token values.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { employeeCapabilityMatrix } from "../src/agents/capability-matrix";
import type { CapabilityContract } from "../src/lib/capability-contract";
import { adapterRegistry } from "../src/verification/adapters";
import {
  describeCredential,
  loadProviderCredentials,
  type ProviderCredential,
} from "../src/verification/credential-source";
import { DEFAULT_EVIDENCE_TTL_MS, EvidenceStore } from "../src/verification/evidence-store";
import { runVerification } from "../src/verification/runner";
import type { VerificationResult } from "../src/verification/types";

export interface CliOptions {
  provider: string;
  tenant?: string;
  tokenFile?: string;
  allowWrites: boolean;
}

export type EntryStatus = "verified" | "failed" | "unverified";

export interface ReportEntry {
  capabilityId: string;
  employeeId: string;
  kind: string;
  status: EntryStatus;
  httpStatus?: number;
  responseShape?: string;
  responseSummary?: string;
  errorMessage?: string;
  reason?: string;
  timestamp?: string;
}

export interface BatchReport {
  provider: string;
  ranAt: string;
  entries: ReportEntry[];
  summary: { verified: number; failed: number; unverified: number; total: number };
  credentialSource: string;
  credentialSummary: string;
}

/** Flatten the employee capability matrix and keep contracts for one provider. */
export function collectContracts(providerId: string): CapabilityContract[] {
  const contracts: CapabilityContract[] = [];
  for (const employeeContracts of Object.values(employeeCapabilityMatrix)) {
    for (const contract of employeeContracts) {
      if (contract.providerId === providerId) contracts.push(contract);
    }
  }
  return contracts;
}

export async function runBatchVerification(options: CliOptions): Promise<BatchReport> {
  const { provider } = options;
  const contracts = collectContracts(provider);
  if (contracts.length === 0) {
    throw new Error(
      `No capability contracts found for provider "${provider}" in the employee capability matrix.`,
    );
  }

  const loaded = loadProviderCredentials(provider, {
    tokenFile: options.tokenFile,
    tenant: options.tenant,
  });
  const credentialSummary = describeCredential(loaded.credential);
  const adapter = adapterRegistry[provider];

  const evidenceStore = new EvidenceStore();
  const entries: ReportEntry[] = [];

  for (const contract of contracts) {
    const base: ReportEntry = {
      capabilityId: contract.capabilityId,
      employeeId: contract.employeeId,
      kind: contract.kind,
      status: "unverified",
    };

    if (!loaded.credential) {
      entries.push({ ...base, reason: "credentials missing — see docs/provider-verification-credentials.md" });
      continue;
    }
    if (!adapter) {
      entries.push({ ...base, reason: "no verification adapter wired for this provider yet" });
      continue;
    }
    if (contract.kind === "automate" && !options.allowWrites) {
      entries.push({ ...base, reason: "write verification disabled (pass --writes)" });
      continue;
    }

    const verify = (c: CapabilityContract, cred: ProviderCredential) =>
      adapter(c, { credentials: cred, app: loaded.app, allowWrites: options.allowWrites });

    const result: VerificationResult = await runVerification(contract, verify, loaded.credential, {
      verifiedBy: "phase7-batch-runner",
      ttlMs: DEFAULT_EVIDENCE_TTL_MS,
    });
    evidenceStore.record(result);

    entries.push({
      ...base,
      status: result.status === "verified" ? "verified" : "failed",
      httpStatus: result.evidence.httpStatus,
      responseShape: result.evidence.responseShape,
      responseSummary: result.evidence.responseSummary,
      errorMessage: result.evidence.errorMessage,
      timestamp: result.evidence.timestamp,
    });
  }

  const summary = {
    verified: entries.filter((e) => e.status === "verified").length,
    failed: entries.filter((e) => e.status === "failed").length,
    unverified: entries.filter((e) => e.status === "unverified").length,
    total: entries.length,
  };

  return {
    provider,
    ranAt: new Date().toISOString(),
    entries,
    summary,
    credentialSource: loaded.source,
    credentialSummary,
  };
}

function renderMarkdown(report: BatchReport): string {
  const lines: string[] = [];
  lines.push(`# Provider verification report — ${report.provider}`);
  lines.push(`Ran at: ${report.ranAt}`);
  lines.push(`Credential source: ${report.credentialSource}`);
  lines.push(`Credential: ${report.credentialSummary}`);
  lines.push("");
  lines.push("| capability | kind | status | http | evidence / reason |");
  lines.push("|---|---|---|---|---|");
  for (const e of report.entries) {
    const detail = e.errorMessage || e.reason || e.responseSummary || e.responseShape || "";
    lines.push(`| ${e.capabilityId} | ${e.kind} | ${e.status} | ${e.httpStatus ?? "—"} | ${detail} |`);
  }
  lines.push("");
  const s = report.summary;
  lines.push(
    `**Summary:** ${s.verified} verified, ${s.failed} failed, ${s.unverified} unverified (${s.total} contracts).`,
  );
  return lines.join("\n");
}

export async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  const options: CliOptions = { provider: "", allowWrites: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = (): string => {
      const v = args[i + 1];
      if (!v || v.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      i++;
      return v;
    };
    if (arg === "--provider") options.provider = next();
    else if (arg === "--tenant") options.tenant = next();
    else if (arg === "--token") options.tokenFile = next();
    else if (arg === "--writes") options.allowWrites = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/verify-provider.ts --provider <id> [--tenant <email>] [--token <file>] [--writes]",
      );
      return;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.provider) throw new Error("--provider is required (e.g. xero, hubspot, slack, jira, docusign, monday-com)");

  const report = await runBatchVerification(options);
  const markdown = renderMarkdown(report);

  const ts = report.ranAt.replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), ".run");
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, `verify-${report.provider}-${ts}.md`);
  writeFileSync(reportPath, markdown, "utf8");

  console.log(markdown);
  console.log(`\nReport written to ${reportPath}`);
  console.log("Evidence recorded in .data/verification_evidence.json (no credential values).");
}

if (import.meta.main) {
  main(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
