/**
 * Xero verification adapter — live API checks for the invoice/ledger capability slice.
 *
 * Canonical hosts: api.xero.com (connections API + accounting API).
 * Read path: GET /Invoices (client.list). Write path (opt-in): create + delete a
 * labeled DRAFT invoice. Failures carry HTTP status text in the thrown error so
 * evidence records stay truthful.
 */
import { createXeroClient } from "../../integrations/providers/xero/client";
import type { CapabilityAdapter } from "./index";

const CONNECTIONS_URL = "https://api.xero.com/connections";

async function resolveTenantId(accessToken: string, known?: string): Promise<string> {
  if (known) return known;
  const response = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Xero connections failed HTTP ${response.status}`);
  }
  const connections = (await response.json()) as Array<{ tenantId: string }>;
  if (!Array.isArray(connections) || connections.length === 0) {
    throw new Error("Xero connections returned no tenant");
  }
  return connections[0].tenantId;
}

function redirectUriFor(provider: string): string {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return base ? `${base}/api/oauth/callback?provider=${provider}` : "";
}

export const xeroAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("Xero credential has no accessToken");

  const tenantId = await resolveTenantId(cred.accessToken, (cred.tenantId as string) || undefined);
  const client = createXeroClient({
    accessToken: cred.accessToken,
    refreshToken: cred.refreshToken,
    expiresAt: cred.expiresAt,
    scope: cred.scope,
    tenantId,
    clientId: ctx.app?.clientId,
    clientSecret: ctx.app?.clientSecret,
    redirectUri: redirectUriFor("xero"),
  });

  switch (contract.capabilityId) {
    case "xero-read-invoices": {
      const invoices = await client.list("Invoices");
      return { httpStatus: 200, response: { count: invoices.length } };
    }
    case "xero-create-draft-invoice": {
      if (!ctx.allowWrites) {
        throw new Error("write verification disabled (pass --writes to verify writes)");
      }
      const label = `Phase7-VERIFY-${Date.now()}`;
      const created = await client.create("Invoices", {
        Type: "ACCREC",
        Status: "DRAFT",
        Contact: { Name: "Phase7 Verification" },
        LineItems: [
          { Description: label, Quantity: 1, UnitAmount: 1.0, AccountCode: "200" },
        ],
        Reference: label,
      });
      const invoice = created?.Invoices?.[0];
      const invoiceId = invoice?.InvoiceID as string | undefined;
      // Rollback: delete the draft we just created so verification leaves no residue.
      if (invoiceId) {
        try {
          await client.update("Invoices", invoiceId, { Status: "DELETED" });
        } catch (cleanupError) {
          throw new Error(
            `draft created (${invoiceId}) but cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          );
        }
      }
      return {
        httpStatus: 200,
        response: { created: Boolean(invoiceId), invoiceNumber: invoice?.InvoiceNumber ?? null },
      };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};
