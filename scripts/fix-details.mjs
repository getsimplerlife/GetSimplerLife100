// Recreate the four $detail routes cleanly: minimal route file + lazy page in
// src/lazy, using Node writeFileSync (handles '$' in filenames). Removes any
// stray misnamed "X..page.tsx" files created earlier.
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

const specs = [
  {
    base: "industries.$industryId",
    path: "/industries/$industryId",
    headPath: "/industries",
    notFound: "Industry not found",
    fn: "IndustryPage",
    pageComp: "IndustryHub",
    data: "industries",
    dataImport: "~/content/industries",
    param: "industryId",
    find: "i => i.id === industryId",
    filter: false,
  },
  {
    base: "workflows.$workflowId",
    path: "/workflows/$workflowId",
    headPath: "/workflows",
    notFound: "Workflow not found",
    fn: "WorkflowRoutePage",
    pageComp: "WorkflowPage",
    data: "workflows",
    dataImport: "~/content/workflows",
    param: "workflowId",
    find: "w => w.id === workflowId",
    filter: false,
  },
  {
    base: "integrations.$integrationId",
    path: "/integrations/$integrationId",
    headPath: "/integrations",
    notFound: "Integration not found",
    fn: "IntegrationRoutePage",
    pageComp: "IntegrationPage",
    data: "integrations",
    dataImport: "~/content/integrations",
    param: "integrationId",
    find: "i => i.id === integrationId",
    filter: true,
  },
  {
    base: "case-studies.$caseStudyId",
    path: "/case-studies/$caseStudyId",
    headPath: "/case-studies",
    notFound: "Case study not found",
    fn: "CaseStudyRoutePage",
    pageComp: "CaseStudyPage",
    data: "caseStudies",
    dataImport: "~/content/case-studies",
    param: "caseStudyId",
    find: "cs => cs.id === caseStudyId",
    filter: false,
  },
];

for (const s of specs) {
  const base = s.base;
  const route = `import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('${s.path}')({
  head: () => pageHead("${s.headPath}"),
  component: lazyRouteComponent(() => import('~/lazy/${base}.page')),
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">${s.notFound}</div>,
});
`;
  writeFileSync(`src/routes/${base}.tsx`, route);

  const dataExpr = s.filter
    ? `${s.data}.filter(Boolean).find(${s.find})`
    : `${s.data}.find(${s.find})`;
  const page = `import { Route } from '~/routes/${base}';
import ${s.pageComp} from '~/components/${s.pageComp}';
import { ${s.data} } from '${s.dataImport}';

function ${s.fn}() {
  const { ${s.param} } = Route.useParams();
  const data = ${dataExpr};
  if (!data) return <div className="text-center py-20 text-stone-400">${s.notFound}</div>;
  return <${s.pageComp} data={data} />;
}

export default ${s.fn};
`;
  writeFileSync(`src/lazy/${base}.page.tsx`, page);

  // remove stray misnamed file if present (e.g. industries..page.tsx)
  const stray = `src/lazy/${base.replace(/\$[^.]+/, "")}..page.tsx`;
  if (existsSync(stray)) {
    unlinkSync(stray);
    console.log(`removed stray ${stray}`);
  }
  console.log(`built ${base} (route + src/lazy page)`);
}
