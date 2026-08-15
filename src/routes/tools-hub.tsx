import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/tools-hub")({
  head: () => pageHead("/tools-hub"),
  beforeLoad: () => {
    throw redirect({
      to: "/tools",
    });
  },
});
