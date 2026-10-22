/**
 * Role-based owner gating (P1-5, owner green-lit 10-22).
 *
 * The tenant user model carries a role claim. The platform owner account
 * (users.json) is seeded as role "admin" by the data-store migration (see
 * src/lib/data-store.ts seedDataFiles/repair block) and "owner" is accepted as
 * an alias so a future rename can never silently change gating. Registered
 * customers have role "user" (handleRegister) → never an owner.
 *
 * EVERY admin/owner gate in the app must go through isOwnerUser()/isOwnerRole()
 * instead of comparing a hardcoded email string: server gates (prod-server.ts
 * /api/admin/*, /api/data/users, entitlement + CRM/ERP-slot bypasses,
 * src/api/integrationRoutes.ts isAdmin), the portal shell (Admin Panel
 * visibility, owner badges) and the SSR user injection.
 */
export const LEGACY_OWNER_EMAIL = "mathewortiz97@gmail.com";

/** Roles that confer tenant-owner/admin power. */
export const OWNER_ROLES = ["admin", "owner"] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

export function isOwnerUser(user: { email?: string; role?: string } | null | undefined): boolean {
  return !!user && isOwnerRole(user.role);
}