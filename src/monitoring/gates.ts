type TenantGate = { purchased: boolean; status: "Active" | "Paused" | "Inactive" };
const tenants = new Map<string, TenantGate>();
export function configureTenant(tenantId: string, gate: TenantGate): void { tenants.set(tenantId, gate); }
export function isActive(tenantId: string): boolean { const gate = tenants.get(tenantId); return gate?.status === "Active" || gate?.status === "Paused"; }
export function canMonitor(tenantId: string, _employeeId: string): boolean { const gate = tenants.get(tenantId); return gate?.purchased === true && (gate.status === "Active" || gate.status === "Paused"); }
export function clearTenants(): void { tenants.clear(); }
