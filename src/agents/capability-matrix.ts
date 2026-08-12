import { invoiceLedgerCapabilities } from "./capabilities/invoice-ledger";
import { salesOutreachCapabilities } from "./capabilities/sales-outreach";
import { customerSupportCapabilities } from "./capabilities/customer-support";
import { hrCoordinatorCapabilities } from "./capabilities/hr-coordinator";
import { complianceCapabilities } from "./capabilities/compliance";
import { communicationsCapabilities } from "./capabilities/communications";
import { logisticsCapabilities, logisticsCapabilitiesExtended } from "./capabilities/logistics";
import { manufacturingCapabilities, manufacturingCapabilitiesExtended } from "./capabilities/manufacturing";
import { procurementCapabilities, procurementCapabilitiesExtended } from "./capabilities/procurement";
import { customerSuccessCapabilities } from "./capabilities/customer-success";
import { operationsCapabilities, operationsCapabilitiesExtended } from "./capabilities/operations";
import { financeCapabilities, financeCapabilitiesExtended } from "./capabilities/finance";
import { salesCapabilities } from "./capabilities/sales";
import { marketingCapabilities } from "./capabilities/marketing";
import { itOperationsCapabilities } from "./capabilities/it-operations";
import { fpaCapabilities } from "./capabilities/fpa";
import { documentProcessingCapabilities } from "./capabilities/document-processing";
import { analyticsCapabilities } from "./capabilities/analytics";
import { productivityCapabilities } from "./capabilities/productivity";

/** Registry-free capability matrix; statuses stay unverified until fresh provider evidence exists. */
export const employeeCapabilityMatrix = {
  invoice_ledger: invoiceLedgerCapabilities,
  sales_outreach: salesOutreachCapabilities,
  customer_support: customerSupportCapabilities,
  hr_coordinator: hrCoordinatorCapabilities,
  compliance: complianceCapabilities,
  communications: communicationsCapabilities,
  logistics: [...logisticsCapabilities, ...logisticsCapabilitiesExtended],
  manufacturing: [...manufacturingCapabilities, ...manufacturingCapabilitiesExtended],
  procurement: [...procurementCapabilities, ...procurementCapabilitiesExtended],
  customer_success: customerSuccessCapabilities,
  operations: [...operationsCapabilities, ...operationsCapabilitiesExtended],
  finance: [...financeCapabilities, ...financeCapabilitiesExtended],
  sales: salesCapabilities,
  marketing: marketingCapabilities,
  it_operations: itOperationsCapabilities,
  fpa: fpaCapabilities,
  document_processing: documentProcessingCapabilities,
  analytics: analyticsCapabilities,
  productivity: productivityCapabilities,
} as const;
