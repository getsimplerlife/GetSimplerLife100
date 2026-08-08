// Client entry — uses createRoot (not hydrateRoot) to avoid React error #418
// when SSR HTML doesn't exactly match client render. SW registration ensures
// stale cached pages from old deploys are cleaned up.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultNotFoundComponent: () => <p>Page not found</p>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

// Register self-destruct SW v5 to clean up stale cached HTML from v1-v4.
// Without this, old service workers persist in returning visitors' browsers,
// intercepting requests and serving cached pages that predate SSR fixes.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
