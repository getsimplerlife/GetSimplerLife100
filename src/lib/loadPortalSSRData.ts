/**
 * SSR data loading utility for portal pages.
 *
 * During server-side rendering (SSR), this reads data directly from
 * the filesystem so pages render with real content instead of skeletons.
 * During client builds and browser execution, all functions return null.
 *
 * IMPORTANT: File system imports are dynamic to avoid bundling failures
 * in the client build. Vite/SSR handles this correctly.
 */

const DATA_DIR = "/home/team/shared/site/.data";
const isSSR = typeof window === "undefined";

function getFS() {
  if (!isSSR) return null;
  try {
    // Dynamic require to avoid client-side bundling
    return {
      readFileSync: (path: string, enc: string) => {
        const fs = require("fs") as any;
        return fs.readFileSync(path, enc);
      },
      existsSync: (path: string) => {
        const fs = require("fs") as any;
        return fs.existsSync(path);
      },
    };
  } catch {
    return null;
  }
}

function readJSON(path: string): any {
  const fs = getFS();
  if (!fs) return null;
  try {
    if (!fs.existsSync(path)) return null;
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Get the user email during SSR by reading the temp file that
 * prod-server writes before proxying to Nitro.
 * Returns empty string on client.
 */
function getSSRUserEmail(): string {
  const fs = getFS();
  if (!fs) return "";
  try {
    const content = fs.readFileSync("/tmp/ssr_user_email.txt", "utf-8").trim();
    if (content) return content;
  } catch {}
  return "";
}

export interface PortalSSRData {
  employees?: any[];
  tasks?: any[];
  approvals?: any[];
  billing?: any[];
  integrations?: any[];
  providers?: any;
  notifications?: any[];
  documents?: any[];
  reports?: any[];
  settings?: any;
  workflows?: any;
  purchases?: any[];
  marketplace?: any[];
}

/**
 * Load portal data during SSR by reading data files directly.
 * Returns null on the client (where filesystem is unavailable).
 */
export function loadPortalSSRData(keys: string[], userEmailOverride?: string): PortalSSRData | null {
  if (!isSSR) return null;

  const userEmail = userEmailOverride || getSSRUserEmail();
  const result: PortalSSRData = {};
  try {
    for (const key of keys) {
      switch (key) {
        case "employees":
          result.employees = readJSON(DATA_DIR + "/ai_employees.json");
          break;
        case "tasks": {
          const tasksAll = readJSON(DATA_DIR + "/tenant_tasks.json");
          if (userEmail && tasksAll) result.tasks = tasksAll[userEmail] || [];
          else result.tasks = [];
          break;
        }
        case "approvals": {
          const approvalsAll = readJSON(DATA_DIR + "/tenant_approvals.json");
          if (userEmail && approvalsAll) result.approvals = approvalsAll[userEmail] || [];
          else result.approvals = [];
          break;
        }
        case "billing": {
          const purchasesAll = readJSON(DATA_DIR + "/tenant_purchases.json");
          if (userEmail && purchasesAll) result.billing = purchasesAll[userEmail] || [];
          else result.billing = [];
          break;
        }
        case "integrations": {
          const integrationsAll = readJSON(DATA_DIR + "/tenant_integrations.json");
          if (userEmail && integrationsAll) result.integrations = integrationsAll[userEmail] || [];
          else result.integrations = [];
          break;
        }
        case "providers":
          result.providers = readJSON(DATA_DIR + "/integrations.json");
          break;
        case "notifications": {
          const notifAll = readJSON(DATA_DIR + "/tenant_notifications.json");
          if (userEmail && notifAll) result.notifications = notifAll[userEmail] || [];
          else result.notifications = [];
          break;
        }
        case "documents": {
          const docsAll = readJSON(DATA_DIR + "/tenant_documents.json");
          if (userEmail && docsAll) result.documents = docsAll[userEmail] || [];
          else result.documents = [];
          break;
        }
        case "reports": {
          const runsAll = readJSON(DATA_DIR + "/workflow_runs.json");
          if (userEmail && runsAll) result.reports = runsAll[userEmail] || [];
          else result.reports = [];
          break;
        }
        case "settings": {
          const settingsAll = readJSON(DATA_DIR + "/tenant_settings.json");
          if (userEmail && settingsAll) result.settings = settingsAll[userEmail] || {};
          else result.settings = {};
          break;
        }
        case "workflows":
          result.workflows = readJSON(DATA_DIR + "/workflow_templates.json");
          break;
      }
    }
  } catch {
    // Silently return whatever we got
  }
  return Object.keys(result).length > 0 ? result : null;
}
