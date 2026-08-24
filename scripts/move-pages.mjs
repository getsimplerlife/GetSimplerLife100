// Move lazy page files out of src/routes (they'd be scanned as routes by the
// TanStack Router generator -> path conflicts) into src/lazy, and rewrite
// imports:
//   - route files:  import('./X.page')            -> import('~/lazy/X.page')
//   - page files:   import { Route } from './X'   -> import { Route } from '~/routes/X'
import { readdirSync, readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const routesDir = "src/routes";
const lazyDir = "src/lazy";
mkdirSync(lazyDir, { recursive: true });

const pageFiles = readdirSync(routesDir).filter((f) => f.endsWith(".page.tsx"));

for (const f of pageFiles) {
  // move file
  renameSync(join(routesDir, f), join(lazyDir, f));
  // page file: rewrite Route import from relative ./X to ~/routes/X
  const pagePath = join(lazyDir, f);
  let pc = readFileSync(pagePath, "utf8");
  const base = f.replace(/\.page\.tsx$/, "");
  pc = pc.replace(
    /import\s*\{\s*Route\s*\}\s*from\s*["']\.\/([^"']+)["']/,
    () => `import { Route } from '~/routes/${base}'`
  );
  writeFileSync(pagePath, pc);

  // route file: rewrite lazy import
  const routePath = join(routesDir, f.replace(/\.page\.tsx$/, ".tsx"));
  let rc = readFileSync(routePath, "utf8");
  rc = rc.replace(
    /import\(["']\.\/([^"']+)\.page["']\)/g,
    () => `import('~/lazy/${base}.page')`
  );
  writeFileSync(routePath, rc);
  console.log(`moved ${f} -> ${lazyDir}/${f}`);
}

console.log("total page files moved:", pageFiles.length);
