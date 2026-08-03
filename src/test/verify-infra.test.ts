import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasAdapter } from "../verification/adapters";
import {
  loadOAuthAppCredentials,
  loadProviderCredentials,
  loadStoredCredential,
  loadTokenFile,
} from "../verification/credential-source";
import { EvidenceStore } from "../verification/evidence-store";
import { collectContracts } from "../../scripts/verify-provider";

const originalEnv: NodeJS.ProcessEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("phase 7 verification infra — contract collection", () => {
  it("collects xero contracts from the employee capability matrix", () => {
    const contracts = collectContracts("xero");
    expect(contracts.length).toBeGreaterThanOrEqual(2);
    const ids = contracts.map((c) => c.capabilityId);
    expect(ids).toContain("xero-read-invoices");
    expect(ids).toContain("xero-create-draft-invoice");
    for (const c of contracts) expect(c.providerId).toBe("xero");
  });

  it("collects hubspot and monday-com contracts", () => {
    const hubspot = collectContracts("hubspot");
    expect(hubspot.map((c) => c.capabilityId)).toContain("hubspot-read-contacts");
    // Capability contracts use providerId "monday" (MONDAY_PROVIDER_ID), not the module id "monday-com".
    const monday = collectContracts("monday");
    expect(monday.map((c) => c.capabilityId)).toContain("monday-read-boards");
  });

  it("returns an empty list for unknown providers (no matrix entries)", () => {
    expect(collectContracts("definitely-not-a-provider")).toEqual([]);
  });
});

describe("phase 7 verification infra — credential source", () => {
  it("loads a raw token file", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    const file = join(dir, "token.txt");
    writeFileSync(file, "raw-token-value");
    const cred = loadTokenFile(file);
    expect(cred.accessToken).toBe("raw-token-value");
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads a JSON credential file and rejects JSON without token fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    const file = join(dir, "cred.json");
    writeFileSync(file, JSON.stringify({ accessToken: "abc", refreshToken: "r", expiresAt: 123 }));
    expect(loadTokenFile(file).accessToken).toBe("abc");
    writeFileSync(file, JSON.stringify({ foo: "bar" }));
    expect(() => loadTokenFile(file)).toThrow(/no accessToken\/apiToken/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds a stored credential by tenant:provider and by bare provider key", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    writeFileSync(
      join(dir, "tenant_oauth_credentials.json"),
      JSON.stringify({
        "a@example.com:xero": { provider: "xero", accessToken: "tok-a", expiresAt: 1 },
        xero: { clientId: "cid", clientSecret: "cs" },
      }),
    );
    const byTenant = loadStoredCredential("xero", { tenant: "a@example.com", dataDir: dir });
    expect(byTenant.credential?.accessToken).toBe("tok-a");
    expect(byTenant.credential?.provider).toBe("xero");
    // Bare provider key with only app creds is not a usable tenant credential.
    const noTenant = loadStoredCredential("xero", { dataDir: dir });
    expect(noTenant.credential?.accessToken).toBe("tok-a");
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads OAuth app credentials from OAUTH_<PROVIDER>_CLIENT_ID/SECRET env vars", () => {
    process.env.OAUTH_XERO_CLIENT_ID = "app-id";
    process.env.OAUTH_XERO_CLIENT_SECRET = "app-secret";
    expect(loadOAuthAppCredentials("xero")).toEqual({ clientId: "app-id", clientSecret: "app-secret" });
    delete process.env.OAUTH_XERO_CLIENT_ID;
    delete process.env.OAUTH_XERO_CLIENT_SECRET;
    expect(loadOAuthAppCredentials("xero")).toBeUndefined();
  });

  it("prefers an explicit token file over stored credentials", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    const tokenFile = join(dir, "raw.txt");
    writeFileSync(tokenFile, "explicit-token");
    writeFileSync(
      join(dir, "tenant_oauth_credentials.json"),
      JSON.stringify({ "a@example.com:slack": { accessToken: "stored-token" } }),
    );
    const loaded = loadProviderCredentials("slack", { tokenFile, tenant: "a@example.com", dataDir: dir });
    expect(loaded.credential?.accessToken).toBe("explicit-token");
    expect(loaded.source).toBe(tokenFile);
    rmSync(dir, { recursive: true, force: true });
  });

  it("never fabricates credentials when nothing is stored", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    mkdirSync(dir, { recursive: true });
    const loaded = loadProviderCredentials("slack", { dataDir: dir });
    expect(loaded.credential).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("phase 7 verification infra — evidence store", () => {
  it("persists records and respects expiry", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-evidence-"));
    const file = join(dir, "evidence.json");
    const store = new EvidenceStore(file);
    const now = Date.now();
    const fresh: VerificationResultLike = {
      capabilityId: "xero-read-invoices",
      status: "verified",
      evidence: {
        capabilityId: "xero-read-invoices",
        providerId: "xero",
        timestamp: new Date(now).toISOString(),
        httpStatus: 200,
        responseShape: "array",
        verifiedBy: "test",
      },
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    store.record(fresh);
    const reloaded = new EvidenceStore(file);
    expect(reloaded.get("xero-read-invoices")?.status).toBe("verified");
    expect(reloaded.isVerified("xero-read-invoices", now)).toBe(true);
    expect(reloaded.isVerified("xero-read-invoices", now + 120_000)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("handles a missing evidence file", () => {
    const store = new EvidenceStore(join(tmpdir(), "does-not-exist-verification_evidence.json"));
    expect(store.load()).toEqual({});
    expect(store.get("nope")).toBeUndefined();
    expect(store.isVerified("nope")).toBe(false);
  });
});

describe("phase 7 verification infra — adapter registry", () => {
  it("wires the priority providers and keeps unknown providers unwired", () => {
    for (const id of ["xero", "hubspot", "slack", "jira", "docusign", "monday-com", "intercom", "salesforce", "zendesk", "workday", "servicenow"]) {
      expect(hasAdapter(id)).toBe(true);
    }
    expect(hasAdapter("not-a-provider")).toBe(false);
  });
});

// Local shape mirror so the test does not depend on runner internals.
interface VerificationResultLike {
  capabilityId: string;
  status: string;
  evidence: { capabilityId: string; providerId: string; timestamp: string; httpStatus?: number; responseShape?: string; verifiedBy: string };
  expiresAt: string;
}
