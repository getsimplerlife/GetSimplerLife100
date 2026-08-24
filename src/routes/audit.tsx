import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getUser } from "~/db/queries";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/audit')({
  head: () => pageHead("/audit"),
  loader: async () => {
    const user = await getUser();
    return { user };
  },
  component: lazyRouteComponent(() => import('~/lazy/audit.page')),
});
