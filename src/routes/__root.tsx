import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import appCss from "~/styles/app.css?url";

// Page-specific titles (path prefix → title)
const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  "/about": { title: "About Simpler Life 100 | Our Mission", description: "We build AI operations teams to liberate people from repetitive manual work." },
  "/contact": { title: "Contact Simpler Life 100 | Get in Touch", description: "Get in touch with the Simpler Life 100 team." },
  "/faq": { title: "FAQ | Simpler Life 100 AI Employees", description: "Frequently asked questions about AI employees, pricing, integrations, and deployment." },
  "/how-it-works": { title: "How It Works | Simpler Life 100", description: "Purchase AI employees, deploy instantly, and connect to 180+ integration providers." },
  "/build": { title: "Build Your AI Team | Simpler Life 100", description: "Build your custom AI Operations Team. Choose from 17 AI agents across 3 builder packages." },
  "/case-studies": { title: "Case Studies | Simpler Life 100", description: "Real results from AI Operations Teams across logistics, manufacturing, healthcare, and retail." },
  "/support": { title: "Support | Simpler Life 100", description: "Get help with your AI Operations Team. Contact support or schedule a consultation." },
  "/industries": { title: "Industries | Simpler Life 100", description: "Industry-specific AI Operations Teams for 23 verticals." },
  "/pricing": { title: "Pricing | Simpler Life 100 AI Employees", description: "AI Operations Teams starting at $499/mo. 180+ integrations." },
  "/demo": { title: "Request a Demo | Simpler Life 100", description: "See Simpler Life 100 in action. Request a personalized demo." },
  "/login": { title: "Login | Simpler Life 100", description: "Login to your Simpler Life 100 account." },
  "/register": { title: "Register | Simpler Life 100", description: "Create your Simpler Life 100 account." },
  "/set-password": { title: "Set Password | Simpler Life 100", description: "Set your account password." },
  "/tools": { title: "AI Operations Tools | Simpler Life 100", description: "Interactive tools to assess and plan your AI automation." },
  "/roi-calculator": { title: "ROI Calculator | Simpler Life 100", description: "Calculate your ROI from AI operations automation." },
};

function resolvePageMeta(pathname: string) {
  if (!pathname) return null;
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const [prefix, meta] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "?")) {
      return meta;
    }
  }
  return null;
}

export const Route = createRootRoute({
  head: ({ matches }: { matches?: any[] }) => {
    let pageMeta = null;
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const pathname = lastMatch?.pathname || lastMatch?.routeId || "";
      if (pathname) pageMeta = resolvePageMeta(pathname);
    }

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
        { title: pageMeta?.title || "Simpler Life 100 | AI Operations Teams" },
        { name: "description", content: pageMeta?.description || "Replace hours of manual work with AI coworkers that integrate into your existing tools. Real results, no complexity." },
        { name: "theme-color", content: "#000000" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "apple-mobile-web-app-title", content: "Simpler Life" }
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "dns-prefetch", href: "https://js.stripe.com" },
        { rel: "preconnect", href: "https://js.stripe.com" },
        { rel: "manifest", href: "/manifest.json" },
        { rel: "apple-touch-icon", href: "/icon-192.png" }
      ],
    };
  },
  notFoundComponent: () => <div>Page not found</div>,
  component: RootComponent,
});

function usePageMeta() {
  const routerState = useRouterState();
  const pathname = routerState.location?.pathname || "/";
  return resolvePageMeta(pathname);
}

function RootComponent() {
  const pageMeta = usePageMeta();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("ServiceWorker registered successfully with scope: ", reg.scope);
          })
          .catch((err) => {
            console.error("ServiceWorker registration failed: ", err);
          });
      });
    }
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
  return (
    <html lang="en" className="dark">
      <head>
        {pageMeta && (
          <>
            <title>{pageMeta.title}</title>
            <meta name="description" content={pageMeta.description} />
          </>
        )}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
