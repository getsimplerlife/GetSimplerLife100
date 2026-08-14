import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { durableClose, durableFlush, durableGet, initDurableStore, MemoryKvDriver } from "../lib/durable-store";
import { hasAdapter } from "../verification/adapters";
import {
  loadOAuthAppCredentials,
  loadProviderCredentials,
  loadStoredCredential,
  loadTokenFile,
  persistRefreshedCredential,
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

  it("loads a stored credential from the durable store when the file is missing", async () => {
    await durableClose();
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    try {
      const driver = new MemoryKvDriver({
        "tenant_oauth_credentials.json": {
          "owner@example.com:google-docs": { provider: "google-docs", accessToken: "tok-durable", expiresAt: 1 },
          "tenant@example.com:google-docs": { provider: "google-docs", accessToken: "tok-other" },
        },
      });
      const init = await initDurableStore(dir, driver);
      expect(init.enabled).toBe(true);
      // No tenant_oauth_credentials.json on disk — the durable store must win.
      const byTenant = loadStoredCredential("google-docs", { tenant: "owner@example.com", dataDir: dir });
      expect(byTenant.credential?.accessToken).toBe("tok-durable");
      expect(byTenant.source).toContain("durable:tenant_oauth_credentials.json#owner@example.com:google-docs");
      // No tenant given: first `:provider` key wins (same order as the file path).
      const noTenant = loadStoredCredential("google-docs", { dataDir: dir });
      expect(noTenant.credential?.accessToken).toBe("tok-durable");
    } finally {
      await durableClose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the file when the durable store has no credential", async () => {
    await durableClose();
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    try {
      await initDurableStore(dir, new MemoryKvDriver()); // durable enabled but empty
      writeFileSync(
        join(dir, "tenant_oauth_credentials.json"),
        JSON.stringify({ "a@example.com:xero": { provider: "xero", accessToken: "tok-file" } }),
      );
      const byTenant = loadStoredCredential("xero", { tenant: "a@example.com", dataDir: dir });
      expect(byTenant.credential?.accessToken).toBe("tok-file");
      expect(byTenant.source).toContain("tenant_oauth_credentials.json#a@example.com:xero");
    } finally {
      await durableClose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports credentials missing when neither durable store nor file has one", async () => {
    await durableClose();
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    try {
      await initDurableStore(dir, new MemoryKvDriver()); // durable enabled but empty
      mkdirSync(dir, { recursive: true }); // no credentials file at all
      const loaded = loadStoredCredential("slack", { dataDir: dir });
      expect(loaded.credential).toBeUndefined();
      expect(loaded.source).toBe(`no ${join(dir, "tenant_oauth_credentials.json")}`);
    } finally {
      await durableClose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("persists a rotated refresh token back to the durable store (Xero single-use refresh tokens)", async () => {
    await durableClose();
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    try {
      const driver = new MemoryKvDriver({
        "tenant_oauth_credentials.json": {
          "owner@example.com:xero": {
            provider: "xero",
            accessToken: "old-access",
            refreshToken: "old-refresh",
            expiresAt: 100, // expired
          },
        },
      });
      await initDurableStore(dir, driver);
      const loaded = loadProviderCredentials("xero", { tenant: "owner@example.com", dataDir: dir });
      expect(loaded.credential?.accessToken).toBe("old-access");
      // Simulate the adapter refreshing in-memory (ensureFreshCredential mutates the
      // credential object with a fresh access token + ROTATED refresh token).
      loaded.credential!.accessToken = "new-access";
      loaded.credential!.refreshToken = "new-refresh";
      loaded.credential!.expiresAt = Math.floor(Date.now() / 1000) + 1800;
      persistRefreshedCredential("xero", loaded.credential!, { tenant: "owner@example.com", dataDir: dir });
      await durableFlush();
      // The rotated refresh token must survive in the durable store.
      const stored = durableGet("tenant_oauth_credentials.json") as Record<string, any>;
      const entry = stored["owner@example.com:xero"];
      expect(entry.accessToken).toBe("new-access");
      expect(entry.refreshToken).toBe("new-refresh");
      expect(entry.expiresAt).toBe(loaded.credential!.expiresAt);
      expect(typeof entry.updatedAt).toBe("string");
    } finally {
      await durableClose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("persistRefreshedCredential merges into live state without dropping other fields", async () => {
    await durableClose();
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    try {
      const driver = new MemoryKvDriver({
        "tenant_oauth_credentials.json": {
          "owner@example.com:xero": {
            provider: "xero",
            accessToken: "old-access",
            refreshToken: "old-refresh",
            expiresAt: 100,
            tenantId: "org-123", // unrelated field that must survive the merge
            scope: "accounting.invoices.read",
          },
        },
      });
      await initDurableStore(dir, driver);
      const loaded = loadProviderCredentials("xero", { tenant: "owner@example.com", dataDir: dir });
      loaded.credential!.accessToken = "fresh-access";
      loaded.credential!.refreshToken = "fresh-refresh";
      loaded.credential!.expiresAt = Math.floor(Date.now() / 1000) + 3600;
      persistRefreshedCredential("xero", loaded.credential!, { tenant: "owner@example.com", dataDir: dir });
      await durableFlush();
      const stored = durableGet("tenant_oauth_credentials.json") as Record<string, any>;
      const entry = stored["owner@example.com:xero"];
      expect(entry.tenantId).toBe("org-123");
      expect(entry.scope).toBe("accounting.invoices.read");
      expect(entry.accessToken).toBe("fresh-access");
      expect(entry.refreshToken).toBe("fresh-refresh");
    } finally {
      await durableClose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("persistRefreshedCredential is a no-op when nothing is stored (never fabricates)", async () => {
    await durableClose();
    const dir = mkdtempSync(join(tmpdir(), "verify-cred-"));
    try {
      await initDurableStore(dir, new MemoryKvDriver());
      persistRefreshedCredential("xero", { accessToken: "x", refreshToken: "y" }, { dataDir: dir });
      await durableFlush();
      expect(durableGet("tenant_oauth_credentials.json")).toBeUndefined();
      expect(existsSync(join(dir, "tenant_oauth_credentials.json"))).toBe(false);
    } finally {
      await durableClose();
      rmSync(dir, { recursive: true, force: true });
    }
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
