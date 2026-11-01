import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import "~/styles/app.css";
import { resolvePageMeta } from "~/lib/site-meta";
import { NotFoundPage } from "~/components/NotFoundPage";
import { RouteError } from "~/components/RouteError";


export const Route = createRootRoute({
  // SLICE 156 — a real page for a URL that matches no route, in the site's own
  // visual language (the server answers 404 for the same path).
  notFoundComponent: NotFoundPage,
  errorComponent: RouteError,
  component: RootComponent,
});

function usePageMeta() {
  const routerState = useRouterState();
  const pathname = routerState.location?.pathname || "/";
  return resolvePageMeta(pathname);
}
/** Set (or update) a meta tag in <head>; returns the element. */
function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}
function RootComponent() {
  const pageMeta = usePageMeta();

  // Set document title client-side (CSR mode — no SSR head export)
  useEffect(() => {
    const title = pageMeta?.title || "Simpler Life 100 | One Platform for AI-Automated Client Ops";
    const description = pageMeta?.description || "One platform for AI-automated client operations. Real, working automation with human approval by default — no complexity.";
    document.title = title;
    // Update meta description
    upsertMeta("name", "description", description);
    // Open Graph + Twitter cards (client fallback; SSR heads set these per-route)
    const canonicalUrl = `https://simplerlife100.ctonew.app${window.location.pathname || "/"}`;
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:site_name", "Simpler Life 100");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
  }, [pageMeta]);

  useEffect(() => {
    // Capture the PWA install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      window.dispatchEvent(new CustomEvent("pwa-install-available"));
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // Remove duplicate headers if any
  useEffect(() => {
    const headers = document.querySelectorAll('header');
    if (headers.length > 1) {
      for (let i = 1; i < headers.length; i++) headers[i].remove();
    }
  }, []);

  return (
    <RootDocument pageMeta={pageMeta}>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children, pageMeta: _pageMeta }: { children: ReactNode; pageMeta: { title: string; description: string } | null }) {
  // In CSR mode, we render into a <div id="root"> inside the HTML shell.
  // We do NOT render <html>/<head>/<body> — those are in the static index.html.
  // TanStack Router handles <head> mgmt via HeadContent.
  return (
    <>
      <HeadContent />
      <Scripts />
      {children}
    </>
  );
}
