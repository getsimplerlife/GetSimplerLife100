/**
 * Xero verification adapter — live API checks for the Invoice & Ledger capability slice.
 *
 * Canonical host: api.xero.com (connections API + accounting API).
 *
 * Token handling: the stored access token may be expired. Refresh happens ONCE per
 * run and mutates the shared credential object, because Xero rotates refresh tokens
 * on every use — refreshing per contract call would invalidate the previous refresh
 * token and fail with invalid_grant.
 *
 * Read paths: GET /<Entity> for invoices, bills (ACCPAY invoices), purchase orders,
 * bank transactions, contacts, accounts, manual journals, payments, credit notes,
 * tax rates, currencies, items, tracking categories, repeating invoices, budgets,
 * and GET /Reports/<Name> for the profit & loss, balance sheet, and trial balance.
 *
 * Write paths (opt-in via --writes): create a labeled Phase7-* artifact and LEAVE it
 * in place (non-destructive, owner directive). Zero delete/archive/rollback calls —
 * deletion inside client/owner accounts is explicit-client-request only.
 *
 * Monitor paths: cannot be exercised by a batch CLI — they require a live webhook
 * receiver; the adapter fails closed with that reason rather than fabricating.
 */
import { refreshXeroToken } from "../../integrations/providers/xero/auth";
import { createXeroClient, type XeroClient } from "../../integrations/providers/xero/client";
import { isTokenExpired } from "../../integrations/framework/oauth";
import type { ProviderCredential } from "../credential-source";
import type { CapabilityAdapter } from "./index";

const CONNECTIONS_URL = "https://api.xero.com/connections";
const LABEL_PREFIX = "Phase7-VERIFY-";

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
  if (!base) return "";
  if (provider === "xero") return `${base}/api/xero-callback`;
  return `${base}/api/oauth/callback?provider=${provider}`;
}

/**
 * Refresh the access token once if it is expired. Mutates `cred` so every later
 * contract call in the same run reuses the fresh token (refresh-token rotation safe).
 */
async function ensureFreshCredential(cred: ProviderCredential, app?: { clientId?: string; clientSecret?: string }): Promise<void> {
  const tokenLike = { accessToken: cred.accessToken, refreshToken: cred.refreshToken, expiresAt: cred.expiresAt };
  if (!cred.refreshToken || !isTokenExpired(tokenLike as never)) return;
  if (!app?.clientId || !app?.clientSecret) {
    throw new Error(
      "Xero access token expired and OAUTH_XERO_CLIENT_ID/SECRET are not configured — cannot refresh (see .env)",
    );
  }
  const refreshed = await refreshXeroToken(
    { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: redirectUriFor("xero") },
    cred.refreshToken,
  );
  cred.accessToken = refreshed.accessToken;
  cred.refreshToken = refreshed.refreshToken;
  cred.expiresAt = refreshed.expiresAt;
  if (refreshed.scope) cred.scope = refreshed.scope;
}

/** First active account code usable on line items (real org data, never guessed). */
async function findAccountCode(client: XeroClient): Promise<string> {
  const accounts = await client.list("Accounts");
  const active = accounts.find((a) => a.Status === "ACTIVE" && a.Code && a.Type !== "BANK");
  if (!active?.Code) throw new Error("no active non-bank account found to build a verification line item");
  return active.Code;
}

/** Active BANK account id — required by the Xero Payments API. */
async function findBankAccountId(client: XeroClient): Promise<string> {
  const accounts = await client.list("Accounts");
  const bank = accounts.find((a) => a.Type === "BANK" && a.Status === "ACTIVE" && a.AccountID);
  if (!bank?.AccountID) throw new Error("no active BANK account found for payment verification");
  return bank.AccountID;
}

/** Create a labeled contact and return its ContactID (used for PO/payment references). */
async function ensureContact(client: XeroClient): Promise<string> {
  const label = `${LABEL_PREFIX}${Date.now()}`;
  const created = await client.create("Contacts", { Name: `Phase7 Verification ${label}` });
  const id = created?.Contacts?.[0]?.ContactID as string | undefined;
  if (!id) throw new Error("contact created but response contained no ContactID");
  return id;
}

/** Enrich provider validation errors with the API response body so evidence stays truthful. */
function describeError(error: unknown): never {
  if (error && typeof error === "object" && "body" in (error as { body?: unknown })) {
    const body = (error as { body?: unknown }).body;
    throw new Error(`${error instanceof Error ? error.message : String(error)} — ${JSON.stringify(body).slice(0, 400)}`);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export const xeroAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("Xero credential has no accessToken");
  await ensureFreshCredential(cred, ctx.app);

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

  const requireWrites = () => {
    if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes to verify writes)");
  };

  switch (contract.capabilityId) {
    // ---------------------------------------------------------- reads
    case "xero-read-invoices": {
      const rows = await client.list("Invoices");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-bills": {
      const rows = await client.list("Invoices", 'Type=="ACCPAY"');
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-purchase-orders": {
      const rows = await client.list("PurchaseOrders");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-bank-transactions": {
      const rows = await client.list("BankTransactions");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-contacts": {
      const rows = await client.list("Contacts");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-chart-of-accounts": {
      const rows = await client.list("Accounts");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-manual-journals": {
      const rows = await client.list("ManualJournals");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-payments": {
      const rows = await client.list("Payments");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-credit-notes": {
      const rows = await client.list("CreditNotes");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-tax-rates": {
      const rows = await client.list("TaxRates");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-currencies": {
      const rows = await client.list("Currencies");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-items": {
      const rows = await client.list("Items");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-tracking-categories": {
      const rows = await client.list("TrackingCategories");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-repeating-invoices": {
      const rows = await client.list("RepeatingInvoices");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-budgets": {
      const rows = await client.list("Budgets");
      return { httpStatus: 200, response: { count: rows.length } };
    }
    case "xero-read-profit-and-loss": {
      const res = await client.get("Reports/ProfitAndLoss");
      const report = res?.Reports?.[0];
      return { httpStatus: 200, response: { reportName: report?.ReportName ?? null, reportTitles: report?.ReportTitles ?? null } };
    }
    case "xero-read-balance-sheet": {
      const res = await client.get("Reports/BalanceSheet");
      const report = res?.Reports?.[0];
      return { httpStatus: 200, response: { reportName: report?.ReportName ?? null, reportTitles: report?.ReportTitles ?? null } };
    }
    case "xero-read-trial-balance": {
      const res = await client.get("Reports/TrialBalance");
      const report = res?.Reports?.[0];
      return { httpStatus: 200, response: { reportName: report?.ReportName ?? null, reportTitles: report?.ReportTitles ?? null } };
    }
    // ---------------------------------------------------------- writes
    case "xero-create-draft-invoice": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const accountCode = await findAccountCode(client);
        const created = await client.create("Invoices", {
          Type: "ACCREC",
          Status: "DRAFT",
          Contact: { Name: "Phase7 Verification" },
          LineItems: [{ Description: label, Quantity: 1, UnitAmount: 1.0, AccountCode: accountCode }],
          Reference: label,
        });
        const invoice = created?.Invoices?.[0];
        const invoiceId = invoice?.InvoiceID as string | undefined;
        if (!invoiceId) throw new Error("draft invoice created but response contained no InvoiceID");
        return { httpStatus: 200, response: { created: true, kept: true, invoiceId, invoiceNumber: invoice?.InvoiceNumber ?? null } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    case "xero-create-bill": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const accountCode = await findAccountCode(client);
        const created = await client.create("Invoices", {
          Type: "ACCPAY",
          Status: "DRAFT",
          Contact: { Name: "Phase7 Verification" },
          LineItems: [{ Description: label, Quantity: 1, UnitAmount: 1.0, AccountCode: accountCode }],
          Reference: label,
        });
        const bill = created?.Invoices?.[0];
        const billId = bill?.InvoiceID as string | undefined;
        if (!billId) throw new Error("bill created but response contained no InvoiceID");
        return { httpStatus: 200, response: { created: true, kept: true, billId, invoiceNumber: bill?.InvoiceNumber ?? null } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    case "xero-create-purchase-order": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const accountCode = await findAccountCode(client);
        // Xero POs require a ContactID (name-only contacts are rejected).
        const contactId = await ensureContact(client);
        const created = await client.create("PurchaseOrders", {
          Status: "DRAFT",
          Contact: { ContactID: contactId },
          LineItems: [{ Description: label, Quantity: 1, UnitAmount: 1.0, AccountCode: accountCode }],
          Reference: label,
        });
        const po = created?.PurchaseOrders?.[0];
        const poId = po?.PurchaseOrderID as string | undefined;
        if (!poId) throw new Error("purchase order created but response contained no PurchaseOrderID");
        return { httpStatus: 200, response: { created: true, kept: true, poId, contactId, purchaseOrderNumber: po?.PurchaseOrderNumber ?? null } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    case "xero-create-contact": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const created = await client.create("Contacts", { Name: `Phase7 Verification ${label}` });
        const contact = created?.Contacts?.[0];
        const contactId = contact?.ContactID as string | undefined;
        if (!contactId) throw new Error("contact created but response contained no ContactID");
        return { httpStatus: 200, response: { created: true, kept: true, contactId } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    case "xero-create-manual-journal": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const accountCode = await findAccountCode(client);
        const created = await client.create("ManualJournals", {
          Status: "DRAFT",
          Narration: label,
          JournalLines: [
            { LineAmount: 1.0, AccountCode: accountCode, Description: label },
            { LineAmount: -1.0, AccountCode: accountCode, Description: label },
          ],
        });
        const journal = created?.ManualJournals?.[0];
        const journalId = journal?.ManualJournalID as string | undefined;
        if (!journalId) throw new Error("manual journal created but response contained no ManualJournalID");
        return { httpStatus: 200, response: { created: true, kept: true, journalId, journalNumber: journal?.JournalNumber ?? null } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    case "xero-create-payment": {
      requireWrites();
      try {
        const label = `${LABEL_PREFIX}${Date.now()}`;
        const accountCode = await findAccountCode(client);
        // Payments must reference a document (invoice) and a bank account. Some orgs
        // (e.g. this test tenant) have no BANK account; create a labeled one for the
        // verification and leave it in place (non-destructive, owner directive).
        let bankAccountId: string | undefined;
        try {
          bankAccountId = await findBankAccountId(client);
        } catch {
          const created = await client.create("Accounts", {
            Code: `9${String(Date.now()).slice(-8)}`,
            Name: `Phase7 Verification Bank ${label}`,
            Type: "BANK",
            Description: label,
          });
          const acct = created?.Accounts?.[0];
          if (!acct?.AccountID) throw new Error("bank account created but response contained no AccountID");
          bankAccountId = acct.AccountID as string;
        }
        const invoiceRes = await client.create("Invoices", {
          Type: "ACCREC",
          Status: "DRAFT",
          Contact: { Name: "Phase7 Verification" },
          LineItems: [{ Description: label, Quantity: 1, UnitAmount: 1.0, AccountCode: accountCode }],
          Reference: label,
        });
        const invoiceId = invoiceRes?.Invoices?.[0]?.InvoiceID as string | undefined;
        if (!invoiceId) throw new Error("payment setup invoice created but response contained no InvoiceID");
        const created = await client.create("Payments", {
          Date: new Date().toISOString().slice(0, 10),
          Invoice: { InvoiceID: invoiceId },
          Account: { AccountID: bankAccountId },
          Amount: 1.0,
          Reference: label,
        });
        const payment = created?.Payments?.[0];
        const paymentId = payment?.PaymentID as string | undefined;
        if (!paymentId) throw new Error("payment created but response contained no PaymentID");
        return { httpStatus: 200, response: { created: true, kept: true, paymentId, invoiceId, bankAccountId } };
      } catch (error) {
        describeError(error);
      }
      break;
    }
    // --------------------------------------------------------- monitor
    case "xero-monitor-invoice-created":
      throw new Error(
        "monitor verification requires a live webhook receiver (INVOICE.CREATED); the batch CLI cannot fabricate event receipt",
      );
    case "xero-monitor-bill-created":
      throw new Error(
        "monitor verification requires a live webhook receiver (BILL.CREATED); the batch CLI cannot fabricate event receipt",
      );
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};
