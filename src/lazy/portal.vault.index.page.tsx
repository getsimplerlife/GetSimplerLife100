import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, Input } from "~/components/ui";

/**
 * Portal Document Vault — NATIVE Document & File Intelligence (Phase 1.5a).
 *
 * Drag-and-drop intake → tenant vault (pending approval by default) →
 * auto-folder route suggestions → gated filing / move / archive / destroy →
 * tagged, searchable, versioned document list with an immutable audit trail.
 *
 * Every mutating action calls the /api/vault/* endpoints, which ride the
 * Approval Queue (#164): with approvals ON (default) an action returns
 * { pending: true, actionId } and surfaces in the portal Approvals queue;
 * with autonomy (allow-listed route + known doc id) it executes directly.
 */

interface VaultDoc {
  id: string;
  name: string;
  status: "pending_filing" | "active" | "archived";
  route: string;
  version: number;
  tags: string[];
  docType?: string;
  customer?: string;
  project?: string;
  retention: { policy: string; destroyBy?: string };
  duplicateOf?: string;
  createdAt: string;
  updatedAt: string;
  suggestedRoute?: string;
  suggestedRuleId?: string;
}

interface FolderRule {
  id: string;
  name: string;
  enabled: boolean;
  target: string;
  priority: number;
  match?: { docType?: string[] };
}

const STATUS_BADGE: Record<VaultDoc["status"], { label: string; variant: string }> = {
  pending_filing: { label: "Inbox · pending", variant: "amber" },
  active: { label: "Filed", variant: "emerald" },
  archived: { label: "Archived", variant: "slate" },
};

function fdate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function Vault() {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [rules, setRules] = useState<FolderRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const toast = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      const qs = showArchived ? "?includeArchived=1" : "";
      const res = await fetch(`/api/vault/search${query ? `?q=${encodeURIComponent(query)}${showArchived ? "&includeArchived=1" : ""}` : qs}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      setDocs(Array.isArray(json.data) ? json.data : []);
      setError(null);
    } catch (e: any) {
      setError("Could not load vault: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [query, showArchived]);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/vault/folders");
      if (!res.ok) return;
      const json = await res.json();
      setRules(Array.isArray(json.data.rules) ? json.data.rules : [] as FolderRule[]);
    } catch {
      /* rules are secondary — keep the page usable */
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("route", "");
      setBusyId("__upload_" + file.name);
      try {
        const res = await fetch("/api/vault/upload", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(`⚠️ ${file.name}: ${json.error || "upload rejected"}`);
        } else if (json.data.pending) {
          toast(`📥 ${file.name} captured — filing pending approval`);
        } else if (json.data.duplicate) {
          toast(`♻️ ${file.name} — identical file already in vault`);
        } else {
          toast(`📥 ${file.name} captured to inbox`);
        }
      } catch (e: any) {
        toast(`⚠️ ${file.name}: ${e?.message || "upload failed"}`);
      }
    }
    setBusyId(null);
    loadDocs();
  }

  /** Structured filing contract: file(doc, route) — approval-gated server-side. */
  async function fileNow(doc: VaultDoc, route: string) {
    if (!route) return;
    setBusyId(doc.id);
    try {
      const res = await fetch("/api/vault/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, route }),
      });
      const json = await res.json();
      const out = json.data;
      if (out.pending) toast(`📋 Filing "${doc.name}" sent for approval`);
      else if (out.ok) toast(`✅ Filed "${doc.name}" → ${out.route}`);
      else toast(`⚠️ ${out.error || "filing failed"}`);
    } catch (e: any) {
      toast(`⚠️ ${e?.message || "filing failed"}`);
    }
    setBusyId(null);
    loadDocs();
  }

  async function act(path: string, doc: VaultDoc, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(doc.id);
    try {
      const res = await fetch(`/api/vault/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const json = await res.json();
      const out = json.data;
      if (out.pending) toast(`📋 ${path} of "${doc.name}" sent for approval`);
      else if (out.ok) toast(`✅ ${path} "${doc.name}"`);
      else toast(`⚠️ ${out.error || `${path} failed`}`);
    } catch (e: any) {
      toast(`⚠️ ${e?.message || `${path} failed`}`);
    }
    setBusyId(null);
    loadDocs();
  }

  async function createRule(name: string, target: string) {
    try {
      const res = await fetch("/api/vault/folders/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, target,
          enabled: true,
          dimensions: [
            { kind: "customer", source: "doc.customer" },
            { kind: "type", source: "doc.docType" },
            { kind: "date", source: "doc.createdAt", format: "YYYY" },
          ],
          priority: 100,
        }),
      });
      const json = await res.json();
      if (json.data?.ok) toast(`✅ Rule "${name}" saved`);
      else toast(`⚠️ ${json.data?.error || "rule save failed"}`);
      loadRules();
    } catch (e: any) {
      toast(`⚠️ ${e?.message || "rule save failed"}`);
    }
  }

  async function deleteRule(id: string) {
    try {
      await fetch(`/api/vault/folders/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      loadRules();
    } catch {
      /* ignore */
    }
  }

  const pendingCount = docs.filter((d) => d.status === "pending_filing").length;
  const activeCount = docs.filter((d) => d.status === "active").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Document Vault</h1>
          <p className="text-sm text-slate-400">
            Native capture · auto-folder · approval-gated filing · immutable audit
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="amber">Inbox {pendingCount}</Badge>
          <Badge variant="emerald">Filed {activeCount}</Badge>
        </div>
      </div>

      {feedback && (
        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-2 text-sm text-slate-200">
          {feedback}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragOver ? "border-emerald-400 bg-emerald-950/30" : "border-slate-700 bg-slate-900/40 hover:border-slate-500"
        }`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
      >
        <div className="text-3xl">📥</div>
        <p className="mt-2 text-sm font-medium text-slate-200">
          Drop files here, or click to choose
        </p>
        <p className="mt-1 text-xs text-slate-500">
          PDF · PNG · JPEG · WebP · GIF · DOCX · XLSX · CSV (max 25&nbsp;MB, type-checked by content)
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* Search + filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search name, route, tags, type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          onClick={() => { setShowArchived(!showArchived); }}
          data-testid="toggle-archived"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
        <span className="ml-auto text-xs text-slate-500">{docs.length} documents</span>
      </div>

      {/* Docs list */}
      <div className="mb-8 space-y-2">
        {loading && <p className="text-sm text-slate-500">Loading vault…</p>}
        {!loading && docs.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-500">
            No documents yet — upload a contract, invoice, or any file above.
          </div>
        )}
        {docs.map((doc) => (
          <Card key={doc.id} className="border-slate-800 bg-slate-900/50">
            <CardBody className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-xl">{doc.name.match(/\.(pdf|png|jpe?g|webp|gif|docx|xlsx|csv)$/i)?.[0]?.slice(1).toUpperCase() || "FILE"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-slate-100">{doc.name}</span>
                  <Badge variant={STATUS_BADGE[doc.status].variant as any}>{STATUS_BADGE[doc.status].label}</Badge>
                  {doc.duplicateOf && <Badge variant="slate">duplicate</Badge>}
                  <span className="text-xs text-slate-500">v{doc.version}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-400">
                  {doc.route ? `📁 ${doc.route}` : "📥 Inbox — not yet filed"}
                  {doc.customer ? ` · ${doc.customer}` : ""}
                  {doc.project ? ` / ${doc.project}` : ""}
                </div>
                {doc.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-400">
                    {doc.tags.map((t) => <Badge key={t} variant="slate">#{t}</Badge>)}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {doc.status !== "active" && doc.suggestedRoute && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busyId === doc.id}
                    onClick={() => void fileNow(doc, doc.suggestedRoute!)}
                  >
                    File → {short(doc.suggestedRoute)}
                  </Button>
                )}
                <a href={`/api/vault/download?docId=${encodeURIComponent(doc.id)}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">Download</Button>
                </a>
                {doc.status === "active" && (
                  <Button size="sm" variant="outline" disabled={busyId === doc.id} onClick={() => void act("archive", doc)}>
                    Archive
                  </Button>
                )}
                {doc.status === "archived" && (
                  <Button size="sm" variant="outline" disabled={busyId === doc.id} onClick={() => void act("unarchive", doc)}>
                    Restore
                  </Button>
                )}
                {doc.status !== "active" && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === doc.id}
                    onClick={() => void act("destroy", doc, `Permanently delete "${doc.name}"? This requires approval.`)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Auto-folder rules */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader className="px-4 pt-3 text-sm font-semibold text-slate-200">
          Auto-folder rules — file(document, route) with DSL
        </CardHeader>
        <CardBody className="px-4 pb-4">
          <form
            className="mb-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void createRule(String(fd.get("name") || ""), String(fd.get("target") || ""));
              (e.currentTarget as HTMLFormElement).reset();
            }}
          >
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Rule name</label>
              <Input name="name" placeholder="By customer/type/year" className="w-48" required />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">
                Route template — {"{customer} / {type} / {YYYY}"} etc.
              </label>
              <Input name="target" placeholder="{customer}/{type}/{YYYY}" className="w-full" required />
            </div>
            <Button type="submit" variant="primary" size="sm">+ Add rule</Button>
          </form>
          {rules.length === 0 && <p className="text-xs text-slate-500">No rules yet. Example: <code className="text-emerald-400">{"{customer}"}/{"{type}"}/{"{YYYY}"}</code> → "Acme Corp/Contract/2026".</p>}
          <div className="flex flex-wrap gap-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-1.5 text-xs">
                <span className={rule.enabled ? "text-slate-200" : "text-slate-500 line-through"}>{rule.name}</span>
                <code className="text-emerald-400">{rule.target}</code>
                <button
                  className="text-slate-500 hover:text-red-400"
                  onClick={() => void deleteRule(rule.id)}
                  aria-label="Delete rule"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function short(route: string): string {
  const segs = route.split("/");
  return segs.length > 2 ? `${segs[segs.length - 2]}/${segs[segs.length - 1]}` : route;
}

export default Vault;