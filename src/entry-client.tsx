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

// SW v6: installed via /sw.js in public/. Browsers that already have an older SW
// registered (v4/v5) will auto-detect the updated sw.js on next visit, install v6,
// and v6's activate handler clears stale caches and unregisters — no reload loop.
// We do NOT register SW from JS; the browser handles the upgrade path on its own.

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
