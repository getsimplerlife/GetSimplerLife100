import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/portal/billing/")({
  component: BillingRedirect,
});

function BillingRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/portal/settings", replace: true });
  }, []);
  return null;
}
