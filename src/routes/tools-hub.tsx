import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tools-hub")({
  beforeLoad: () => {
    throw redirect({
      to: "/tools",
    });
  },
});
