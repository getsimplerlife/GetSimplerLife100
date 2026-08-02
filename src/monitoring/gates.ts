type TenantGate = { purchased: boolean; status: "Active" | "Paused" | "Inactive" };
const tenants = new Map<string, TenantGate>();
export function configureTenant(tenantId: string, gate: TenantGate): void { tenants.set(tenantId, gate); }
export function isActive(tenantId: string): boolean { const gate = tenants.get(tenantId); return gate?.status === "Active" || gate?.status === "Paused"; }
export function canMonitor(tenantId: string, _employeeId: string): boolean { const gate = tenants.get(tenantId); return gate?.purchased === true && (gate.status === "Active" || gate.status === "Paused"); }
export function clearTenants(): void { tenants.clear(); }
export function getTenantCount(): number { return tenants.size; }

/** Hydrate tenant gates from purchase data on server startup. Each active purchase grants monitoring. */
export function hydrateTenants(purchasesByEmail: Record<string, { status: string }[]>): void {
  for (const [email, purchases] of Object.entries(purchasesByEmail)) {
    if (Array.isArray(purchases) && purchases.some((p) => p.status === "active")) {
      tenants.set(email, { purchased: true, status: "Active" });
    }
  }
}
