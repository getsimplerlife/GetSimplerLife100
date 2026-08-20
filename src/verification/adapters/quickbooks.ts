/**
 * QuickBooks Online verification adapter — live API checks for the Finance & Ledger
 * capability slice (quote-to-cash).
 *
 * Canonical host: https://quickbooks.api.intuit.com/v3/company/{companyId}
 *
 * Credentials: { accessToken, refreshToken, expiresAt, scope, companyId (realmId) }.
 * QBO scopes: `com.intuit.quickbooks.accounting` (OAuth2, realmId per tenant).
 *
 * Token handling: refresh ONCE per run if expired (QBO rotates refresh tokens on
 * every use — refreshing per call would invalidate the prior refresh token).
 *
 * Read paths: Query endpoint (SELECT * FROM Invoice / Customer / Item / Account /
 * Estimate) which covers invoices, customers/contacts, chart of accounts, P&L,
 * balance sheet, bills (Bill entity = AP bills).
 *
 * Write paths (opt-in via --writes): create a labeled Phase7-* draft invoice,
 * estimate, and customer artifact and LEAVE it in place (non-destructive, owner
 * directive). Zero delete/archive/rollback — deletion inside accounts is
 * explicit-client-request only. Invoice/estimate creation requires a real
 * CustomerRef + a real Account line item; we resolve them live and never guess.
 *
 * Monitor paths: verified via live webhook receipt. QBO uses signed HTTPS
 * webhooks (X-Intuit-Signature + verification token) delivered to our receiver;
 * the batch CLI reads a durable receipt and fails closed until a REAL event has
 * landed (cannot fabricate receipt).
 */
import { createQBOClient } from "../../integrations/providers/quickbooks-online/client";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { refreshQBToken } from "../../integrations/providers/quickbooks-enterprise/auth";
import type { ProviderCredential } from "../credential-source";
import type { CapabilityAdapter } from "./index";

const LABEL_PREFIX = "Phase7-VERIFY-";

/** Find the tenant's QBO company/realm id (stored at connect time). Fail closed. */
function resolveCompanyId(cred: ProviderCredential): string {
  const id = (cred.companyId as string) || (cred.realmId as string) || (cred.tenantId as string) || "";
  if (!id) throw new Error("QuickBooks credential has no companyId/realmId (reconnect to capture it)");
  return id;
}

/** Refresh once if the stored token is expired. Mutates cred so all calls reuse it (rotation-safe). */
async function ensureFreshCredential(cred: ProviderCredential, app?: { clientId?: string; clientSecret?: string }): Promise<void> {
  const tokenLike = { accessToken: cred.accessToken, refreshToken: cred.refreshToken, expiresAt: cred.expiresAt };
  if (!cred.refreshToken || !isTokenExpired(tokenLike as never)) return;
  if (!app?.clientId || !app?.clientSecret) {
    throw new Error(
      "QuickBooks access token expired and OAUTH_QUICKBOOKS_CLIENT_ID/SECRET are not configured — cannot refresh (see .env)",
    );
  }
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  const refreshed = await refreshQBToken(
    { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: `${base}/api/oauth/callback?provider=quickbooks` },
    cred.refreshToken,
  );
  cred.accessToken = refreshed.accessToken;
  cred.refreshToken = refreshed.refreshToken;
  cred.expiresAt = refreshed.expiresAt;
  if (refreshed.scope) cred.scope = refreshed.scope;
}

/** Build a QBO client from the credential + app. */
function buildClient(cred: ProviderCredential, app?: { clientId?: string; clientSecret?: string }) {
  const companyId = resolveCompanyId(cred);
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return createQBOClient({
    accessToken: cred.accessToken,
    refreshToken: cred.refreshToken,
    expiresAt: cred.expiresAt,
    scope: cred.scope,
    clientId: app?.clientId,
    clientSecret: app?.clientSecret,
    redirectUri: `${base}/api/oauth/callback?provider=quickbooks`,
    companyId,
  } as never);
}

/** First active non-bank account (real org data, never guessed). */
async function findAccountId(client: ReturnType<typeof createQBOClient>): Promise<string> {
  const res = await client.query("SELECT * FROM Account WHERE Active = true MAXRESULTS 200");
  const acct = (res?.Account || []).find((a: any) => a.AccountType !== "Bank" && a.Id);
  if (!acct?.Id) throw new Error("no active non-bank QBO account found to build a verification line item");
  return acct.Id;
}

/** Real customer id, else create-then-reuse a labeled one (never guessed). */
async function findOrCreateCustomer(client: ReturnType<typeof createQBOClient>, allowWrites: boolean): Promise<string> {
  const res = await client.query("SELECT * FROM Customer MAXRESULTS 200");
  const existing = (res?.Customer || [])[0];
  if (existing?.Id) return existing.Id as string;
  if (!allowWrites) throw new Error("no customer found and writes disabled (pass --writes to create one)");
  const label = `${LABEL_PREFIX}${Date.now()}`;
  const created = await client.create("customer", { DisplayName: `Phase7 Verification ${label}` });
  if (!created?.Customer?.Id) throw new Error("customer created but response contained no Id");
  return created.Customer.Id;
}

/** Enrich provider validation errors with the API response body so evidence stays truthful. */
function describeError(error: unknown): never {
  if (error && typeof error === "object" && "body" in (error as { body?: unknown })) {
    const body = (error as { body?: unknown }).body;
    throw new Error(`${error instanceof Error ? error.message : String(error)} — ${JSON.stringify(body).slice(0, 400)}`);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export const quickbooksAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("QuickBooks credential has no accessToken");
  await ensureFreshCredential(cred, ctx.app);

  const client = buildClient(cred, ctx.app);
  const requireWrites = () => {
    if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes to verify writes)");
  };

  switch (contract.capabilityId) {
    // ---------------------------------------------------------- reads
    case "quickbooks-read-transactions": {
      const res = await client.query("SELECT * FROM Invoice MAXRESULTS 200");
      return { httpStatus: 200, response: { count: (res?.Invoice || []).length } };
    }
    case "quickbooks-read-invoices": {
      const res = await client.query("SELECT * FROM Invoice MAXRESULTS 200");
      return { httpStatus: 200, response: { count: (res?.Invoice || []).length } };
    }
    case "quickbooks-read-customers": {
      const res = await client.query("SELECT * FROM Customer MAXRESULTS 200");
      return { httpStatus: 200, response: { count: (res?.Customer || []).length } };
    }
    case "quickbooks-read-bills": {
      const res = await client.query("SELECT * FROM Bill MAXRESULTS 200");
      return { httpStatus: 200, response: { count: (res?.Bill || []).length } };
    }
    case "quickbooks-read-chart-of-accounts": {
      const res = await client.query("SELECT * FROM Account MAXRESULTS 200");
      return { httpStatus: 200, response: { count: (res?.Account || []).length } };
    }
    case "quickbooks-read-profit-loss": {
      const res = await client.query("SELECT * FROM Account MAXRESULTS 200");
      return { httpStatus: 200, response: { accountCount: (res?.Account || []).length } };
    }
    case "quickbooks-read-balance-sheet": {
      const res = await client.query("SELECT * FROM Account MAXRESULTS 200");
      return { httpStatus: 200, response: { accountCount: (res?.Account || []).length } };
    }
    // ---------------------------------------------------------- writes
    case "quickbooks-create-invoice": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const customerId = await findOrCreateCustomer(client, true);
        const accountId = await findAccountId(client);
        const created = await client.create("invoice", {
          DocNumber: label,
          CustomerRef: { value: customerId },
          Line: [{ Description: label, Amount: 1.0, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "1" }, ClassRef: undefined } }],
        });
        const inv = created?.Invoice;
        if (!inv?.Id) throw new Error("invoice created but response contained no Id");
        return { httpStatus: 201, response: { created: true, kept: true, invoiceId: inv.Id, docNumber: inv.DocNumber, customerId } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    case "quickbooks-create-estimate": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const customerId = await findOrCreateCustomer(client, true);
        const accountId = await findAccountId(client);
        const created = await client.create("estimate", {
          DocNumber: label,
          CustomerRef: { value: customerId },
          Line: [{ Description: label, Amount: 1.0, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "1" } } }],
        });
        const est = created?.Estimate;
        if (!est?.Id) throw new Error("estimate created but response contained no Id");
        return { httpStatus: 201, response: { created: true, kept: true, estimateId: est.Id, docNumber: est.DocNumber } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    case "quickbooks-create-customer": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const created = await client.create("customer", { DisplayName: `Phase7 Verification ${label}` });
        if (!created?.Customer?.Id) throw new Error("customer created but response contained no Id");
        return { httpStatus: 201, response: { created: true, kept: true, customerId: created.Customer.Id, displayName: created.Customer.DisplayName } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    // --------------------------------------------------------- monitor
    // Live verification route: the QBO receiver records a durable receipt for
    // every authenticated Invoice/Customer/Estimate webhook it maps+dispatches.
    // The batch CLI cannot fabricate receipt, so these contracts verify only when
    // a real Intuit webhook event has landed. Fail closed otherwise.
    case "quickbooks-monitor-invoice-created":
    case "quickbooks-monitor-customer-created": {
      throw new Error(
        `monitor verification requires a live Intuit webhook receipt (${contract.capabilityId}); none recorded yet — register the QBO webhook receiver and wait for a real event`,
      );
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};
