import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { NotFoundPage } from "~/components/NotFoundPage";
export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
    // SLICE 156 — a URL that matches no route gets the designed not-found page
    // (the server answers 404 for the same path; see prod-server.ts).
    defaultNotFoundComponent: NotFoundPage,
  });
}
