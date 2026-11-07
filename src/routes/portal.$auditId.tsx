import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getUser, getAudit } from "~/db/queries";

/**
 * SLICE 168 — D-9. `/portal/$auditId` is a DYNAMIC child of `/portal`, so every
 * unknown path under the portal (`/portal/projects`, `/portal/clients/123`,
 * `/portal/settings/billing`) resolves here. The loader used to hand the page
 * whatever `getAudit` produced — and in the browser the server-fn polyfill
 * produces `{}` — so the page rendered "⏳ Audit in Progress" for a customer who
 * had ordered nothing. A missing record is now an explicit `null`: the page
 * renders an honest not-found state and never the in-progress copy.
 */
export const Route = createFileRoute("/portal/$auditId")({
  beforeLoad: async () => {
    const user = await getUser();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { user };
  },
  loader: async ({ params }) => {
    try {
      const audit = await getAudit({ data: params.auditId });
      // Only a record that actually carries an id is an audit. Anything else
      // (null, `{}` from the client-side server-fn polyfill, a malformed row)
      // is "no record", which the page renders as not-found.
      if (audit && typeof audit === "object" && (audit as { id?: unknown }).id) {
        return { audit, readFailed: false };
      }
      return { audit: null, readFailed: false };
    } catch {
      // getAudit throws "Audit not found" / "Unauthorized". Neither may become
      // an invented audit in the UI — and a read that FAILED must not be
      // dressed up as "no such record", so the page gets the difference.
      return { audit: null, readFailed: true };
    }
  },
  component: lazyRouteComponent(() => import('~/lazy/portal.$auditId.page')),
});
