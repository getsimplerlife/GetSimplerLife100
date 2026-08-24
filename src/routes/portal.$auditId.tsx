import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getUser, getAudit } from "~/db/queries";

export const Route = createFileRoute("/portal/$auditId")({
  beforeLoad: async () => {
    const user = await getUser();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { user };
  },
  loader: async ({ params }) => {
    const audit = await getAudit({ data: params.auditId });
    return { audit };
  },
  component: lazyRouteComponent(() => import('~/lazy/portal.$auditId.page')),
});
