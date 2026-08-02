import { invoiceLedgerCapabilities } from "./capabilities/invoice-ledger";
import { salesOutreachCapabilities } from "./capabilities/sales-outreach";
import { customerSupportCapabilities } from "./capabilities/customer-support";
import { hrCoordinatorCapabilities } from "./capabilities/hr-coordinator";
import { complianceCapabilities } from "./capabilities/compliance";
import { communicationsCapabilities } from "./capabilities/communications";
import { logisticsCapabilities } from "./capabilities/logistics";
import { manufacturingCapabilities } from "./capabilities/manufacturing";

/** Registry-free capability matrix; statuses stay unverified until fresh provider evidence exists. */
export const employeeCapabilityMatrix = {
  invoice_ledger: invoiceLedgerCapabilities,
  sales_outreach: salesOutreachCapabilities,
  customer_support: customerSupportCapabilities,
  hr_coordinator: hrCoordinatorCapabilities,
  compliance: complianceCapabilities,
  communications: communicationsCapabilities,
  logistics: logisticsCapabilities,
  manufacturing: manufacturingCapabilities,
} as const;
