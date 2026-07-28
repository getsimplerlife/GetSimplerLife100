import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/pricing")({
  component: PricingRedirect,
});

function PricingRedirect() {
  useEffect(() => {
    window.location.replace("/#pricing");
  }, []);
  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <p className="text-stone-400 font-mono">Redirecting to pricing...</p>
    </div>
  );
}
