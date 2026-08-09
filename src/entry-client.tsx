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

// SW v5 self-destruct: v1-v4 cached stale HTML/JS with hydrateRoot causing
// React error #418 for returning visitors. SW v5 on activate clears all caches,
// unregisters, and force-reloads the page. On second activation (after reload)
// caches are empty so v5 just unregisters — no loop.
// We skip registration if sessionStorage says we just went through cleanup,
// adding defense-in-depth against any edge-case reload loops.
if ("serviceWorker" in navigator && !sessionStorage.getItem("sw_cleanup_done")) {
  sessionStorage.setItem("sw_cleanup_done", "1");
  navigator.serviceWorker.register("/sw.js");
}

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
