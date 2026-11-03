import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import {
  CLIENT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  type Client,
  type Project,
} from "~/lib/clients";

/**
 * /portal/clients/$clientId — one client, and the projects that belong to it
 * (slice 189). This is the route that answered a bare 404 before this slice:
 * the product's central entity had no page.
 *
 * FOUR STATES, NEVER THREE. A read can fail, a client can genuinely not exist,
 * the workspace can hold no projects, and the read can succeed — and the page
 * must not confuse them:
 *   - `readError`  → the store did not answer. Says so; prints no empty state.
 *   - `notFound`   → the store answered and has no such client (404).
 *   - `loaded` + zero projects → "No projects yet" is the truth.
 *   - `loaded` + projects → the list.
 * The projects read is tracked separately from the client read, because one
 * failing must not be reported as the other.
 */
export default function ClientDetailPage() {
  const { clientId } = useParams({ from: "/portal/clients/$clientId" });
  const [client, setClient] = useState<Client | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectsError, setProjectsError] = useState("");

  const load = useCallback(async () => {
    setNotFound(false);
    try {
      const res = await fetch(`/api/data/clients/${encodeURIComponent(clientId)}`, { credentials: "include" });
      if (res.status === 404) {
        setClient(null);
        setNotFound(true);
        setReadError("");
        setLoaded(false);
        return;
      }
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const json = await res.json();
      if (!json?.data || typeof json.data !== "object" || !json.data.id) {
        throw new Error("The server answered an unexpected shape.");
      }
      setClient(json.data as Client);
      setReadError("");
      setLoaded(true);
    } catch (e: any) {
      setClient(null);
      setLoaded(false);
      setReadError(e?.message || "The read failed and no reason was given.");
    }
  }, [clientId]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(`/api/data/projects?clientId=${encodeURIComponent(clientId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const json = await res.json();
      if (!Array.isArray(json?.data)) throw new Error("The server answered an unexpected shape.");
      setProjects(json.data as Project[]);
      setProjectsError("");
      setProjectsLoaded(true);
    } catch (e: any) {
      setProjects([]);
      setProjectsLoaded(false);
      setProjectsError(e?.message || "The read failed and no reason was given.");
    }
  }, [clientId]);

  useEffect(() => {
    void load();
    void loadProjects();
  }, [load, loadProjects]);

  if (readError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Link to="/portal/clients" className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
          ← All clients
        </Link>
        <Card className="p-4 border-rose-900/60 bg-rose-950/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-rose-300">This client could not be read.</div>
              <div className="text-xs text-rose-200/80 mt-1 break-words">{readError}</div>
              <div className="text-xs text-rose-200/60 mt-1">
                Nothing is shown below because the read failed — not because this client is gone.
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Link to="/portal/clients" className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
          ← All clients
        </Link>
        <Card className="p-6 space-y-2">
          <div className="text-sm font-bold text-stone-100">No client with this id in this workspace.</div>
          <div className="text-xs text-stone-400 break-all">
            The store was read and it holds no record for <span className="font-mono">{clientId}</span>. It may
            have been created in another workspace, or the link may be wrong.
          </div>
        </Card>
      </div>
    );
  }

  if (!loaded || !client) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-sm text-stone-400">Reading this client…</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link to="/portal/clients" className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
          ← All clients
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-black text-white break-words">{client.name}</h1>
          <Badge variant={client.status === "active" ? "emerald" : client.status === "paused" ? "warning" : "stone"}>
            {CLIENT_STATUS_LABEL[client.status] ?? client.status}
          </Badge>
        </div>
      </div>

      <Card className="p-6 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wide text-stone-200">Contact</h2>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Name</dt>
            <dd className="text-stone-200">{client.contactName || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Email</dt>
            <dd className="text-stone-200 break-all">{client.email || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Phone</dt>
            <dd className="text-stone-200">{client.phone || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Client id</dt>
            <dd className="text-stone-400 font-mono text-xs break-all">{client.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Created</dt>
            <dd className="text-stone-200">{client.createdAt || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Updated</dt>
            <dd className="text-stone-200">{client.updatedAt || "Not recorded"}</dd>
          </div>
        </dl>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wide text-stone-200">Projects</h2>

        {projectsError && (
          <Card className="p-4 border-rose-900/60 bg-rose-950/40">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-bold text-rose-300">This client's projects could not be read.</div>
                <div className="text-xs text-rose-200/80 mt-1 break-words">{projectsError}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void loadProjects()}>
                Try again
              </Button>
            </div>
          </Card>
        )}

        {!projectsError && !projectsLoaded && <div className="text-sm text-stone-400">Reading projects…</div>}

        {projectsLoaded && projects.length === 0 && (
          <PortalEmptyState
            title="No projects yet"
            body="This client has no project. Create one from the projects page and pick this client."
            action={{ label: "Go to projects", to: "/portal/projects" }}
          />
        )}

        {projectsLoaded && projects.length > 0 && (
          <div className="space-y-3">
            {projects.map((project) => (
              <Card key={project.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    to="/portal/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="font-bold text-white hover:text-emerald-400 truncate block"
                  >
                    {project.name}
                  </Link>
                  <div className="text-xs text-stone-400">Created {project.createdAt || "—"}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={project.status === "complete" ? "emerald" : project.status === "on_hold" ? "warning" : "stone"}>
                    {PROJECT_STATUS_LABEL[project.status] ?? project.status}
                  </Badge>
                  <Link
                    to="/portal/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300"
                  >
                    Open →
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-stone-500">
        Proposals, invoices, checklists and deal rooms do not reference this client yet — linking them is the
        next step, and this page will say so until it is done.
      </p>
    </div>
  );
}
