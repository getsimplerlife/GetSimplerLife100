import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Card, Badge, Button } from "~/components/ui";
import { PROJECT_STATUS_LABEL, type Client, type Project } from "~/lib/clients";

/**
 * /portal/projects/$projectId — one project, and the client it belongs to
 * (slice 189).
 *
 * Same four-state discipline as the client detail page: a failed read says it
 * failed and prints no empty state; a 404 says the store was read and holds no
 * such project; only a successful read renders the record. The client is read
 * separately so a missing client NAME cannot be reported as a missing project.
 */
export default function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/portal/projects/$projectId" });
  const [project, setProject] = useState<Project | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const [clientError, setClientError] = useState("");

  const load = useCallback(async () => {
    setNotFound(false);
    try {
      const res = await fetch(`/api/data/projects/${encodeURIComponent(projectId)}`, { credentials: "include" });
      if (res.status === 404) {
        setProject(null);
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
      setProject(json.data as Project);
      setReadError("");
      setLoaded(true);
    } catch (e: any) {
      setProject(null);
      setLoaded(false);
      setReadError(e?.message || "The read failed and no reason was given.");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadClient = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/data/clients/${encodeURIComponent(clientId)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const json = await res.json();
      if (!json?.data || typeof json.data !== "object") throw new Error("The server answered an unexpected shape.");
      setClient(json.data as Client);
      setClientError("");
    } catch (e: any) {
      setClient(null);
      setClientError(e?.message || "The read failed and no reason was given.");
    }
  }, []);

  useEffect(() => {
    if (project?.clientId) void loadClient(project.clientId);
  }, [project?.clientId, loadClient]);

  if (readError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Link to="/portal/projects" className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
          ← All projects
        </Link>
        <Card className="p-4 border-rose-900/60 bg-rose-950/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-rose-300">This project could not be read.</div>
              <div className="text-xs text-rose-200/80 mt-1 break-words">{readError}</div>
              <div className="text-xs text-rose-200/60 mt-1">
                Nothing is shown below because the read failed — not because this project is gone.
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
        <Link to="/portal/projects" className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
          ← All projects
        </Link>
        <Card className="p-6 space-y-2">
          <div className="text-sm font-bold text-stone-100">No project with this id in this workspace.</div>
          <div className="text-xs text-stone-400 break-all">
            The store was read and it holds no record for <span className="font-mono">{projectId}</span>. It may
            have been created in another workspace, or the link may be wrong.
          </div>
        </Card>
      </div>
    );
  }

  if (!loaded || !project) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-sm text-stone-400">Reading this project…</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link to="/portal/projects" className="text-xs font-bold text-emerald-400 hover:text-emerald-300">
          ← All projects
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-black text-white break-words">{project.name}</h1>
          <Badge variant={project.status === "complete" ? "success" : project.status === "on_hold" ? "warning" : "stone"}>
            {PROJECT_STATUS_LABEL[project.status] ?? project.status}
          </Badge>
        </div>
      </div>

      <Card className="p-6 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wide text-stone-200">Project</h2>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Client</dt>
            <dd className="text-stone-200">
              {client ? (
                <Link
                  to="/portal/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="font-bold text-emerald-400 hover:text-emerald-300"
                >
                  {client.name}
                </Link>
              ) : clientError ? (
                <span className="text-amber-400/80">Client record could not be read — {clientError}</span>
              ) : (
                <span className="font-mono text-xs text-stone-400">{project.clientId}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Project id</dt>
            <dd className="text-stone-400 font-mono text-xs break-all">{project.id}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Created</dt>
            <dd className="text-stone-200">{project.createdAt || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Updated</dt>
            <dd className="text-stone-200">{project.updatedAt || "Not recorded"}</dd>
          </div>
        </dl>
      </Card>

      <p className="text-xs text-stone-500">
        Proposals, invoices, checklists and deal rooms do not reference this project yet — linking them is the
        next step, and this page will say so until it is done.
      </p>
    </div>
  );
}
