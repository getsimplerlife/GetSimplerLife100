// Client entry — uses hydrateRoot for SSR hydration
// URL/pathname fix ensures server and client render identically
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
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

hydrateRoot(rootEl,
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
