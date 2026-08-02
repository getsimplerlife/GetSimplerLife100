import { invoiceLedgerCapabilities } from "./capabilities/invoice-ledger";
import { salesOutreachCapabilities } from "./capabilities/sales-outreach";
import { customerSupportCapabilities } from "./capabilities/customer-support";

/** Registry-free capability matrix; statuses stay unverified until fresh provider evidence exists. */
export const employeeCapabilityMatrix = {
  invoice_ledger: invoiceLedgerCapabilities,
  sales_outreach: salesOutreachCapabilities,
  customer_support: customerSupportCapabilities,
} as const;
