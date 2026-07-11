import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/roi-assessment")({
  beforeLoad: () => {
    throw redirect({
      to: "/assessment",
    });
  },
});
