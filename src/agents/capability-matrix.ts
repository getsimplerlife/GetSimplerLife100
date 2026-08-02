import { invoiceLedgerCapabilities } from "./capabilities/invoice-ledger";
import { salesOutreachCapabilities } from "./capabilities/sales-outreach";
import { customerSupportCapabilities } from "./capabilities/customer-support";
import { hrCoordinatorCapabilities } from "./capabilities/hr-coordinator";
import { complianceCapabilities } from "./capabilities/compliance";
import { communicationsCapabilities } from "./capabilities/communications";
import { logisticsCapabilities } from "./capabilities/logistics";
import { manufacturingCapabilities } from "./capabilities/manufacturing";
import { procurementCapabilities } from "./capabilities/procurement";
import { customerSuccessCapabilities } from "./capabilities/customer-success";
import { operationsCapabilities } from "./capabilities/operations";
import { financeCapabilities } from "./capabilities/finance";
import { salesCapabilities } from "./capabilities/sales";
import { marketingCapabilities } from "./capabilities/marketing";
import { itOperationsCapabilities } from "./capabilities/it-operations";
import { fpaCapabilities } from "./capabilities/fpa";
import { documentProcessingCapabilities } from "./capabilities/document-processing";
import { analyticsCapabilities } from "./capabilities/analytics";
import { phase1bCapabilities } from "./capabilities/phase1b-expansions";

/** Registry-free capability matrix; statuses stay unverified until fresh provider evidence exists. */
export const employeeCapabilityMatrix = {
  invoice_ledger: invoiceLedgerCapabilities,
  sales_outreach: salesOutreachCapabilities,
  customer_support: customerSupportCapabilities,
  hr_coordinator: hrCoordinatorCapabilities,
  compliance: complianceCapabilities,
  communications: communicationsCapabilities,
  logistics: [...logisticsCapabilities, ...phase1bCapabilities.logistics],
  manufacturing: [...manufacturingCapabilities, ...phase1bCapabilities.manufacturing],
  procurement: [...procurementCapabilities, ...phase1bCapabilities.procurement],
  customer_success: customerSuccessCapabilities,
  operations: [...operationsCapabilities, ...phase1bCapabilities.operations],
  finance: [...financeCapabilities, ...phase1bCapabilities.finance],
  sales: salesCapabilities,
  marketing: marketingCapabilities,
  it_operations: itOperationsCapabilities,
  fpa: fpaCapabilities,
  document_processing: documentProcessingCapabilities,
  analytics: analyticsCapabilities,
} as const;
