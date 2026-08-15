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

function ErrorComponent({ error, info }: { error: Error; info?: { componentStack: string } }) {
  // Log to window.__errors so the debugger in index.html captures it
  if (typeof window !== "undefined" && (window as any).__errors) {
    (window as any).__errors.push("ROUTE ERROR: " + error.message + "\n" + (error.stack || ""));
  }
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: "2rem", fontFamily: "monospace", color: "#d4d4d4", background: "#0a0a0a"
    }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: "1rem", color: "#ef4444" }}>
        Something went wrong
      </h1>
      <pre style={{
        maxWidth: "700px", padding: "1rem", background: "#1a1a1a", borderRadius: "0.5rem",
        fontSize: "0.75rem", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
        border: "1px solid #333", color: "#f87171"
      }}>
        {error.message}
      </pre>
      {info && (
        <details style={{ marginTop: "1rem", maxWidth: "700px", width: "100%" }}>
          <summary style={{ cursor: "pointer", color: "#888", fontSize: "0.75rem" }}>Component Stack</summary>
          <pre style={{
            padding: "0.5rem", background: "#1a1a1a", borderRadius: "0.25rem",
            fontSize: "0.65rem", overflow: "auto", whiteSpace: "pre-wrap", color: "#888", marginTop: "0.5rem"
          }}>
            {info.componentStack}
          </pre>
        </details>
      )}
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "1.5rem", padding: "0.5rem 1.5rem", background: "#333", color: "#fff",
          border: "1px solid #555", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem"
        }}
      >
        Reload Page
      </button>
    </div>
  );
}

export const Route = createRootRoute({
  notFoundComponent: () => <div>Page not found</div>,
  errorComponent: ErrorComponent,
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
    const title = pageMeta?.title || "Simpler Life 100 | AI Operations Teams";
    const description = pageMeta?.description || "Replace hours of manual work with AI coworkers that integrate into your existing tools. Real results, no complexity.";
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

function RootDocument({ children, pageMeta }: { children: ReactNode; pageMeta: { title: string; description: string } | null }) {
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
