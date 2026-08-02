import { invoiceLedgerCapabilities } from "./capabilities/invoice-ledger";
import { salesOutreachCapabilities } from "./capabilities/sales-outreach";

/** Registry-free capability matrix; statuses stay unverified until fresh provider evidence exists. */
export const employeeCapabilityMatrix = {
  invoice_ledger: invoiceLedgerCapabilities,
  sales_outreach: salesOutreachCapabilities,
} as const;
