/** Shared, declarative capability contract. This module has no provider/network side effects. */
export type CapabilityKind = "understand" | "monitor" | "automate";
export type CapabilityStatus = "real" | "partial" | "unsupported" | "unverified";

export interface CapabilityContract {
  employeeId: string;
  capabilityId: string;
  kind: CapabilityKind;
  status: CapabilityStatus;
  providerId?: string;
  tenantScoped: boolean;
  authRequired: boolean;
  auditRequired: boolean;
  idempotencyRequired: boolean;
  retryPolicy: "none" | "bounded";
  rollback: "not_applicable" | "required" | "available";
  evidence: string;
}

export interface CapabilityContractInput extends Omit<CapabilityContract, "status"> {
  status?: CapabilityStatus;
}

/**
 * Construct a truthful contract. Unverified capabilities default to unverified,
 * and writes/monitoring can never omit their safety requirements.
 */
export function defineCapabilityContract(input: CapabilityContractInput): CapabilityContract {
  const status = input.status ?? "unverified";
  if (!input.employeeId || !input.capabilityId || !input.evidence) throw new Error("Capability contract requires identity and evidence");
  if (input.kind === "automate" && (!input.tenantScoped || !input.authRequired || !input.auditRequired || !input.idempotencyRequired || input.retryPolicy !== "bounded" || input.rollback === "not_applicable")) {
    throw new Error("Automate capability requires tenant scope, auth, audit, idempotency, bounded retry, and rollback");
  }
  if (input.kind === "monitor" && (!input.tenantScoped || !input.authRequired || !input.auditRequired || input.retryPolicy !== "bounded")) {
    throw new Error("Monitor capability requires tenant scope, auth, audit, and bounded retry");
  }
  return { ...input, status };
}
