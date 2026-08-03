// Client hydration entry — replaces main.tsx for SSR hydration
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

// Hydrate the SSR-rendered DOM (falls back to client render if no SSR HTML)
hydrateRoot(
  rootEl,
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
