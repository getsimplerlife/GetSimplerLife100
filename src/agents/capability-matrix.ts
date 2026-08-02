import { invoiceLedgerCapabilities } from "./capabilities/invoice-ledger";

/** Registry-free capability matrix; statuses stay unverified until fresh provider evidence exists. */
export const employeeCapabilityMatrix = {
  invoice_ledger: invoiceLedgerCapabilities,
} as const;
