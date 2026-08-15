import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/roi-assessment")({
  head: () => pageHead("/roi-assessment"),
  beforeLoad: () => {
    throw redirect({
      to: "/assessment",
    });
  },
});
