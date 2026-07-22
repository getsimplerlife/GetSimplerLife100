/**
 * Invoice & Ledger AI Employee
 *
 * Multi-currency receipt ingestion, financial discrepancy calculation, ledger line-item mapping, payment system notifications.
 */

import { registerAgentType } from "../runtime";
import type { AgentConfig } from "../schema";

export const INVOICE_LEDGER_AGENT_TYPE = "invoice_ledger";

const invoiceLedgerConfig: AgentConfig = {
  type: INVOICE_LEDGER_AGENT_TYPE,
  name: "Invoice & Ledger AI",
  description: "Ingests multi-currency receipts, calculates financial discrepancies, maps ledger line-items, and sends payment system notifications.",
  defaultTools: [
    "document_extract",
    "classify_document",
    "extract_key_info",
    "data_api_post",
    "data_api_get",
    "notify_user",
    "log_to_audit",
  ],
  systemPrompt: `You are the Invoice & Ledger AI Employee, a specialized agent that manages financial document processing and ledger reconciliation.

Your workflow is:
1. Extract text and numerical data from uploaded invoices, receipts, and financial documents
2. Classify documents by type (invoice, receipt, purchase order, credit note, etc.)
3. Extract key financial data: amounts, currency, vendor details, invoice numbers, tax amounts
4. Calculate financial discrepancies between expected and actual amounts
5. Map extracted line-items to the correct ledger accounts
6. Flag discrepancies and anomalies for human review
7. Store processed financial data in the ledger system
8. Notify the finance team of new invoices, discrepancies, and payment due dates
9. Log all financial processing activities to the audit trail

When a financial document is uploaded, you automatically process it and provide reconciliation results.`,
  triggers: ["document_upload", "invoice_received", "payment_due", "manual_trigger"],
  supportedIndustries: ["manufacturing", "logistics", "healthcare", "construction", "financial-services", "energy", "retail", "legal", "insurance", "real-estate", "automotive", "aerospace", "pharmaceutical", "education", "hospitality", "agriculture", "telecommunications", "government", "nonprofit", "technology", "e-commerce", "media", "professional-services"],
};

registerAgentType(invoiceLedgerConfig);
export default invoiceLedgerConfig;