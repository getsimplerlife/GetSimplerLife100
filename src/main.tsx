import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

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

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
