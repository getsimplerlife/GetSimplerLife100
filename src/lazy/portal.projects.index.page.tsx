import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, Badge, Button, Input } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  type Client,
  type Project,
} from "~/lib/clients";

/**
 * /portal/projects — the work, each row owned by one client (slice 189).
 *
 * A project cannot exist without a client: the create form only offers clients
 * that the store actually returned, and the server refuses a `clientId` that
 * is not in this tenant's client rows. When the workspace has no clients at
 * all, the form is not shown — it points at /portal/clients instead of
 * offering a picker with nothing in it.
 *
 * HONESTY: two reads (projects, and clients for the names/picker), each with
 * its own outcome. A failed projects read prints the failure and no empty
 * state; a failed clients read does not hide the projects — it drops the
 * client NAME and says so, because the project rows themselves were read fine.
 */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [clientsError, setClientsError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<string>("planned");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data/projects", { credentials: "include" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const json = await res.json();
      if (!Array.isArray(json?.data)) throw new Error("The server answered an unexpected shape.");
      setProjects(json.data as Project[]);
      setReadError("");
      setLoaded(true);
    } catch (e: any) {
      setProjects([]);
      setLoaded(false);
      setReadError(e?.message || "The read failed and no reason was given.");
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/data/clients", { credentials: "include" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const json = await res.json();
      if (!Array.isArray(json?.data)) throw new Error("The server answered an unexpected shape.");
      setClients(json.data as Client[]);
      setClientsError("");
      setClientsLoaded(true);
    } catch (e: any) {
      setClients([]);
      setClientsLoaded(false);
      setClientsError(e?.message || "The read failed and no reason was given.");
    }
  }, []);

  useEffect(() => {
    void load();
    void loadClients();
  }, [load, loadClients]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const res = await fetch("/api/data/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, clientId, status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `The server answered ${res.status}.`);
      setName("");
      setStatus("planned");
      await load();
    } catch (err: any) {
      setFormError(err?.message || "The project was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const clientName = (id: string): string => {
    const found = clients.find((c) => c.id === id);
    return found ? found.name : id;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-black text-white">Projects</h1>
        <p className="text-sm text-stone-400 mt-1">Work in flight, each project owned by one client.</p>
      </header>

      {readError && (
        <Card className="p-4 border-rose-900/60 bg-rose-950/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-rose-300">Your project list could not be read.</div>
              <div className="text-xs text-rose-200/80 mt-1 break-words">{readError}</div>
              <div className="text-xs text-rose-200/60 mt-1">
                The list is empty below because the read failed — not because you have no projects.
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {!readError && !loaded && <div className="text-sm text-stone-400">Reading your projects…</div>}

      {loaded && projects.length === 0 && (
        <PortalEmptyState
          title="No projects yet"
          body="Create a project below and attach it to one of your clients."
          action={{ label: "Create the first project", onClick: () => scrollToId("new-project") }}
        />
      )}

      {loaded && projects.length > 0 && (
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
                <div className="text-xs text-stone-400 truncate">
                  {clientsLoaded ? (
                    <Link
                      to="/portal/clients/$clientId"
                      params={{ clientId: project.clientId }}
                      className="hover:text-emerald-400"
                    >
                      {clientName(project.clientId)}
                    </Link>
                  ) : (
                    <span className="text-amber-400/80">
                      Client name unavailable — the client list could not be read.
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge
                  variant={
                    project.status === "complete" ? "emerald" : project.status === "on_hold" ? "warning" : "stone"
                  }
                >
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

      <Card id="new-project" className="p-6 space-y-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-stone-200">New project</h2>

        {clientsError && (
          <div className="text-xs font-bold text-rose-400 break-words">
            Your clients could not be read, so a project cannot be created right now: {clientsError}
          </div>
        )}

        {!clientsError && !clientsLoaded && <div className="text-xs text-stone-400">Reading your clients…</div>}

        {clientsLoaded && clients.length === 0 && (
          <div className="text-sm text-stone-300">
            Every project belongs to a client, and this workspace has none yet.{" "}
            <Link to="/portal/clients" className="font-bold text-emerald-400 hover:text-emerald-300">
              Create a client first →
            </Link>
          </div>
        )}

        {clientsLoaded && clients.length > 0 && (
          <form onSubmit={createProject} className="grid sm:grid-cols-2 gap-4">
            <Input
              id="project-name"
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q4 onboarding rollout"
              required
            />
            <div>
              <label htmlFor="project-client" className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                Client
              </label>
              <select
                id="project-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm shadow-sm"
              >
                <option value="">Choose a client…</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="project-status" className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
                Status
              </label>
              <select
                id="project-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm shadow-sm"
              >
                {PROJECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {PROJECT_STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
            {formError && <div className="sm:col-span-2 text-xs font-bold text-rose-400 break-words">{formError}</div>}
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" loading={busy} disabled={busy || !name.trim() || !clientId}>
                Save project
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
