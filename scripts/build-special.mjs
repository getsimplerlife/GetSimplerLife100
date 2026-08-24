// Build route + page files for the 3 special routes that have loader/beforeLoad.
import { readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2]; // e.g. "audit" or "industries.index" or "portal.$auditId"
const orig = readFileSync(`src/routes/${base}.tsx`, "utf8");

function writeRoute(body) {
  writeFileSync(`src/routes/${base}.tsx`, body);
}
function writePage(body) {
  writeFileSync(`src/routes/${base}.page.tsx`, body);
}

if (base === "audit") {
  writeRoute(`import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { getUser } from "~/db/queries";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/audit')({
  head: () => pageHead("/audit"),
  loader: async () => {
    const user = await getUser();
    return { user };
  },
  component: lazyRouteComponent(() => import('./audit.page')),
});
`);
  // page = body after the Route statement (starts at `const VERTICALS`)
  const body = orig.slice(orig.indexOf("const VERTICALS"));
  writePage(`import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Route } from './audit';

${body}
export default AuditChecklist;
`);
  console.log("audit built");
}

if (base === "industries.index") {
  // route: minimal, loader dynamic-imports getPageData from the page module
  writeRoute(`import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/industries/')({
  head: () => pageHead("/industries"),
  loader: () => import('./industries.index.page').then(m => m.getPageData)(),
  component: lazyRouteComponent(() => import('./industries.index.page')),
});
`);
  // page = original imports (minus createFileRoute/pageHead) + getPageData + component + Route import
  const pageBody = orig.slice(orig.indexOf("const getPageData"));
  writePage(`import { Link } from '@tanstack/react-router';
import { createServerFn } from '~/lib/server-fn-polyfill';
import { Header } from '~/components/Header';
import { Footer } from '~/components/Footer';
import { industries } from '~/content/industries';
import { getUser } from '~/db/queries';
import { Route } from './industries.index';

export ${pageBody}
export default IndustriesIndexPage;
`);
  console.log("industries.index built");
}

if (base === "portal.$auditId") {
  writeRoute(`import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getUser, getAudit } from "~/db/queries";

export const Route = createFileRoute("/portal/$auditId")({
  beforeLoad: async () => {
    const user = await getUser();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { user };
  },
  loader: async ({ params }) => {
    const audit = await getAudit({ data: params.auditId });
    return { audit };
  },
  component: lazyRouteComponent(() => import('./portal.$auditId.page')),
});
`);
  // page = original body (function AuditDetail ...) + needed imports + Route import
  const body = orig.slice(orig.indexOf("function AuditDetail"));
  writePage(`import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { submitFeedback } from "~/db/queries";
import { Route } from "./portal.$auditId";

${body}
export default AuditDetail;
`);
  console.log("portal.$auditId built");
}
