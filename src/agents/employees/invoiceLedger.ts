/**
 * Invoice & Ledger AI Employee
 *
 * Processes multi-currency receipts, calculates financial discrepancies,
 * maps ledger line-items, and manages payment notifications.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const INVOICE_LEDGER_AGENT_TYPE = "invoice_ledger";

const invoiceLedgerConfig: AgentConfig = {
  type: INVOICE_LEDGER_AGENT_TYPE,
  name: "Invoice & Ledger AI",
  description: "Orchestrates multi-currency receipt ingestion, calculates financial discrepancies, maps ledger line-items, and auto-notifies payment systems.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
  ],
  systemPrompt: `You are the Invoice & Ledger AI Employee, a specialized agent that processes financial documents and manages ledger entries.
Your workflow is:
1. Extract data from uploaded invoices, receipts, and financial documents
2. Classify document type (invoice, receipt, purchase_order, credit_note, statement)
3. Extract key financial data (amounts, currency, vendor, invoice number, line items, tax, due date)
4. Calculate discrepancies between expected and actual amounts
5. Map line items to the correct ledger accounts
6. Store processed data in the financial records section
7. Notify the user of any discrepancies or approval needs
8. Flag unusual patterns for audit review

When a financial document is uploaded, process it through this pipeline and report back with a summary of all findings.`,
  triggers: ["document_upload", "invoice_received", "manual_trigger"],
};

registerAgentType(invoiceLedgerConfig);
export default invoiceLedgerConfig;