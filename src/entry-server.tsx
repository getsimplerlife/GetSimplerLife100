// SSR entry point — imported by prod-server.ts at runtime (Bun transpiles TSX natively)
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { RouterProvider, createRouter, createMemoryHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface SSRResult {
  html: string;
  statusCode: number;
  headTags: string;
}

export async function renderPage(url: string): Promise<SSRResult> {
  // Create memory history from the requested URL
  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  });

  const router = createRouter({
    routeTree,
    history: memoryHistory,
    defaultPreload: "intent",
  });

  // Load route data
  await router.load();

  // Check if the route returned a redirect or 404
  const state = router.state;
  const statusCode =
    state.matches.length > 0 &&
    state.matches[state.matches.length - 1].status === "notFound" &&
    url !== "/"
      ? 404
      : 200;

  let html: string;
  try {
    html = renderToString(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>
    );
  } catch (err) {
    // If SSR render fails (e.g., browser-only code), return empty shell
    // The client will hydrate and take over
    html = `<div id="root"><!-- SSR fallback — client will hydrate --></div>`;
  }

  // Collect head tags (meta, title, links) from route matches
  let headTags = "";
  for (const match of state.matches) {
    const route = match.route as any;
    if (route?.options?.head) {
      try {
        headTags += route.options.head({ params: match.params });
      } catch {}
    }
  }

  return { html, statusCode, headTags };
}
