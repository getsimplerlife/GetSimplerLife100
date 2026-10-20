/**
 * portal.secure-transport.index.page.tsx — Phase 4.1 native SECURE TRANSPORT
 * portal surface (lazy route). SFTP connection config, pattern-matched
 * transfer rules, PGP key ring and the approval-gated transfer-run ledger —
 * all reads are safe projections (secrets/key material never returned), all
 * mutations ride the Approval Queue (pending cards + approve/reject), and the
 * copy stays HONEST: the run ledger records approval-gated transfer REQUEST
 * previews; live execution requires a configured + live-verified SFTP
 * endpoint (provider-connection pause) — this page never claims a file was
 * moved or encrypted.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";

interface ConnectionView {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMode: string;
  hasSecret: boolean;
  poolMax: number;
  failClosed: boolean;
  updatedAt: string;
}
interface RuleView {
  id: string;
  name: string;
  direction: string;
  pattern: string;
  remoteDir: string;
  localDir: string;
  monitor: { newFile: boolean; contentChange: boolean };
  fileSizeCapMb: number;
}
interface KeyView {
  id: string;
  label: string;
  kind: string;
  fingerprint: string;
  createdAt: string;
}
interface RunView {
  id: string;
  ruleId: string;
  matchedFiles: string[];
  unmatchedFiles: string[];
  status: string;
  outcome: string;
  note: string;
  createdAt: string;
}
interface PendingWriteView {
  id: string;
  op: string;
  action: string;
  status: string;
  requestedAt: string;
}

const PGPSAMPLE = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n(paste armored key material here)\n-----END PGP PUBLIC KEY BLOCK-----";

export default function PortalSecureTransportIndexPage() {
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [rules, setRules] = useState<RuleView[]>([]);
  const [keys, setKeys] = useState<KeyView[]>([]);
  const [runs, setRuns] = useState<RunView[]>([]);
  const [writes, setWrites] = useState<PendingWriteView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, r, k, n, w] = await Promise.all([
        fetch("/api/native/transport/connections", { headers: { accept: "application/json" } }),
        fetch("/api/native/transport/rules", { headers: { accept: "application/json" } }),
        fetch("/api/native/transport/keys", { headers: { accept: "application/json" } }),
        fetch("/api/native/transport/runs", { headers: { accept: "application/json" } }),
        fetch("/api/native/transport/writes", { headers: { accept: "application/json" } }),
      ]);
      if (c.ok) setConnections(((await c.json()) as { data: { connections: ConnectionView[] } }).data.connections ?? []);
      if (r.ok) setRules(((await r.json()) as { data: { rules: RuleView[] } }).data.rules ?? []);
      if (k.ok) setKeys(((await k.json()) as { data: { keys: KeyView[] } }).data.keys ?? []);
      if (n.ok) setRuns(((await n.json()) as { data: { runs: RunView[] } }).data.runs ?? []);
      if (w.ok) setWrites(((await w.json()) as { data: { writes: PendingWriteView[] } }).data.writes ?? []);
    } catch {
      setNotice("Could not reach the secure transport service right now.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreate(path: string, body: unknown): Promise<void> {
    setNotice(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; data?: { status?: string } };
    if (res.ok || res.status === 202) {
      setNotice(json.data?.status === "pending" ? "Queued for approval — approve it from the pending list below." : "Saved.");
      void load();
    } else {
      setNotice(json.error ?? "Request failed.");
    }
  }

  async function decide(tpwId: string, action: "apply" | "reject"): Promise<void> {
    setNotice(null);
    const res = await fetch(`/api/native/transport/writes/${tpwId}/${action}`, { method: "POST", headers: { accept: "application/json" } });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) setNotice(json.error ?? "Decision failed.");
    void load();
  }

  function connForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submitCreate("/api/native/transport/connections", {
      name: f.get("name"),
      host: f.get("host"),
      port: Number(f.get("port") ?? 22),
      username: f.get("username"),
      authMode: f.get("authMode"),
      secret: f.get("secret"),
      poolMax: Number(f.get("poolMax") ?? 4),
      failClosed: true,
    });
  }
  function ruleForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submitCreate("/api/native/transport/rules", {
      name: f.get("name"),
      connectionId: f.get("connectionId"),
      direction: f.get("direction"),
      remoteDir: f.get("remoteDir"),
      localDir: f.get("localDir"),
      pattern: f.get("pattern"),
      monitor: { newFile: true, contentChange: false },
      fileSizeCapMb: Number(f.get("fileSizeCapMb") ?? 100),
      pgpKeyId: f.get("pgpKeyId") || undefined,
    });
  }
  function keyForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submitCreate("/api/native/transport/keys", { label: f.get("label"), kind: f.get("kind"), armored: f.get("armored") });
  }
  function runForm(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const filenames = String(f.get("filenames") ?? "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    void submitCreate("/api/native/transport/runs", { ruleId: f.get("ruleId"), filenames });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Secure Transport</h1>
        <p className="text-sm text-slate-400">
          SFTP endpoint config, pattern-matched transfer rules and the PGP key ring. Every change is approval-gated and
          audited. Transfer runs record the approved request and the files its pattern matched — live execution requires
          a configured and verified SFTP endpoint, and this surface never claims a file was moved or encrypted.
        </p>
      </div>

      {notice && <div className="rounded-md bg-amber-950/50 border border-amber-700/40 px-3 py-2 text-sm">{notice}</div>}

      {writes.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="font-medium mb-2">Pending approvals</h2>
            <ul className="space-y-1 text-sm">
              {writes.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Badge>{w.action}</Badge> <span className="ml-1 text-slate-300">{w.op}</span>
                  </span>
                  <span className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={() => void decide(w.id, "apply")}>Approve</Button>
                    <Button variant="secondary" size="sm" onClick={() => void decide(w.id, "reject")}>Reject</Button>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="font-medium mb-1">SFTP connections</h2>
            <p className="text-xs text-slate-400 mb-2">Credentials are encrypted at rest and never returned to this page.</p>
            <ul className="space-y-1 text-sm mb-3">
              {connections.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>{c.name} — {c.host}:{c.port} ({c.username})</span>
                  <span className="text-slate-400">{c.failClosed ? "fail-closed" : "config"} · pool {c.poolMax}</span>
                </li>
              ))}
            </ul>
            <form onSubmit={connForm} className="grid gap-2 text-sm">
              <input name="name" placeholder="Name" required className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
              <div className="grid grid-cols-3 gap-2">
                <input name="host" placeholder="Host" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                <input name="port" placeholder="Port (22)" defaultValue="22" className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                <input name="username" placeholder="Username" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
              </div>
              <select name="authMode" className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                <option value="password">Password</option>
                <option value="key">Private key</option>
              </select>
              <input name="secret" placeholder="Password or private key" required className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
              <div className="flex justify-between gap-2">
                <input name="poolMax" placeholder="Pool (1-20)" defaultValue="4" className="w-32 rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                <Button type="submit" variant="primary" size="sm">Add connection</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-medium mb-1">Transfer rules</h2>
            <p className="text-xs text-slate-400 mb-2">Pattern matching selects files by name/extension; triggers monitor for new files or content change.</p>
            <ul className="space-y-1 text-sm mb-3">
              {rules.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.name} — {r.direction} {r.pattern}</span>
                  <span className="text-slate-400">{r.remoteDir} · ≤{r.fileSizeCapMb}MB</span>
                </li>
              ))}
            </ul>
            <form onSubmit={ruleForm} className="grid gap-2 text-sm">
              <input name="name" placeholder="Rule name" required className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
              <div className="grid grid-cols-2 gap-2">
                <select name="connectionId" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                  <option value="">Connection…</option>
                  {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select name="direction" className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                  <option value="upload">Upload</option>
                  <option value="download">Download</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="remoteDir" placeholder="/remote/dir" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                <input name="localDir" placeholder="/local/dir" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input name="pattern" placeholder="*.pdf" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                <select name="pgpKeyId" className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                  <option value="">PGP key (none)</option>
                  {keys.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <Button type="submit" variant="primary" size="sm">Add rule</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-medium mb-1">PGP key ring</h2>
            <p className="text-xs text-slate-400 mb-2">Armored key material is stored encrypted at rest; only the fingerprint is shown here.</p>
            <ul className="space-y-1 text-sm mb-3">
              {keys.map((k) => (
                <li key={k.id} className="flex justify-between">
                  <span>{k.label} ({k.kind})</span>
                  <span className="font-mono text-xs text-slate-400">{k.fingerprint.slice(0, 24)}…</span>
                </li>
              ))}
            </ul>
            <form onSubmit={keyForm} className="grid gap-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <input name="label" placeholder="Key label" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                <select name="kind" className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="signing">Signing</option>
                </select>
              </div>
              <textarea name="armored" placeholder={PGPSAMPLE} required rows={3} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs" />
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm">Add key</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-medium mb-1">Transfer runs</h2>
            <p className="text-xs text-slate-400 mb-2">Records the approved transfer request and the files its pattern matched — a request record, not a claim that files moved.</p>
            <ul className="space-y-1 text-sm mb-3">
              {runs.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>rule {r.ruleId} — {r.matchedFiles.length} matched / {r.unmatchedFiles.length} skipped</span>
                  <span className="text-slate-400">{r.createdAt.slice(0, 16).replace("T", " ")}</span>
                </li>
              ))}
            </ul>
            <form onSubmit={runForm} className="grid gap-2 text-sm">
              <select name="ruleId" required className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
                <option value="">Rule…</option>
                {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <textarea name="filenames" placeholder="File names to match (one per line)" rows={2} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs" />
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm">Request transfer run</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}