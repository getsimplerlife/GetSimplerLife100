import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, Badge, Button, Input, PageHeader } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import { CLIENT_STATUSES, CLIENT_STATUS_LABEL, type Client } from "~/lib/clients";

/**
 * /portal/clients — the workspace's customers (slice 189).
 *
 * THE GAP THIS PAGE FILLS. Before this slice the product had no client record
 * at all: a quote, an invoice, a checklist and a deal room were all about a
 * customer the system could not name, and /portal/clients/123 was a bare 404.
 * This is the list half of the spine — read the clients, create one.
 *
 * HONESTY (slice 188's shape, and the reason it is copied exactly). `clients`
 * is `[]` both when the workspace holds no clients and when the store could
 * not be read. `loaded` and `readError` are the only things that separate
 * "you have no clients yet" from "we could not answer", so the empty state is
 * gated on `loaded` and a failed read prints the failure instead. This page
 * must pass `portal-read-failure-guard.test.ts` with ZERO allow-list entries —
 * if the guard flags it, the page is wrong, not the guard.
 *
 * WHAT IT DOES NOT DO: it does not touch invoices, proposals, checklists or
 * deal rooms. Wiring the money path to a client is the next slice.
 */
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string>("active");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data/clients", { credentials: "include" });
      if (!res.ok) throw new Error(`The server answered ${res.status}.`);
      const json = await res.json();
      // The envelope is part of the contract: a 200 that is not `{ data: [] }`
      // is a read we cannot trust, not an empty workspace.
      if (!Array.isArray(json?.data)) throw new Error("The server answered an unexpected shape.");
      setClients(json.data as Client[]);
      setReadError("");
      setLoaded(true);
    } catch (e: any) {
      setClients([]);
      setLoaded(false);
      setReadError(e?.message || "The read failed and no reason was given.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createClient = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const res = await fetch("/api/data/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, contactName, email, phone, status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `The server answered ${res.status}.`);
      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setStatus("active");
      // Re-read instead of trusting the response: the list the page shows is
      // then the store's answer, not the write's echo.
      await load();
    } catch (err: any) {
      setFormError(err?.message || "The client was not saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <PageHeader
        title={<>Clients</>}
        subtitle={<>The customers this workspace serves. Every project belongs to one of them.</>}
      />

      {readError && (
        <Card className="p-4 border-rose-900/60 bg-rose-950/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold text-rose-300">Your client list could not be read.</div>
              <div className="text-xs text-rose-200/80 mt-1 break-words">{readError}</div>
              <div className="text-xs text-rose-200/60 mt-1">
                The list is empty below because the read failed — not because you have no clients.
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {!readError && !loaded && <div className="text-sm text-stone-400">Reading your clients…</div>}

      {loaded && clients.length === 0 && (
        <PortalEmptyState
          title="No clients yet"
          body="Create the first client below. A client is the record every project hangs off."
          action={{ label: "Create the first client", onClick: () => scrollToId("new-client") }}
        />
      )}

      {loaded && clients.length > 0 && (
        <div className="space-y-3">
          {clients.map((client) => (
            <Card key={client.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Link
                  to="/portal/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="font-bold text-white hover:text-emerald-400 truncate block"
                >
                  {client.name}
                </Link>
                <div className="text-xs text-stone-400 truncate">
                  {[client.contactName, client.email, client.phone].filter(Boolean).join(" · ") ||
                    "No contact details yet"}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={client.status === "active" ? "success" : client.status === "paused" ? "warning" : "stone"}>
                  {CLIENT_STATUS_LABEL[client.status] ?? client.status}
                </Badge>
                <Link
                  to="/portal/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300"
                >
                  Open →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card id="new-client" className="p-6 space-y-4">
        <h2 className="text-sm font-black uppercase tracking-wide text-stone-200">New client</h2>
        <form onSubmit={createClient} className="grid sm:grid-cols-2 gap-4">
          <Input
            id="client-name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Testing Ltd"
            required
          />
          <Input
            id="client-contact"
            label="Contact name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Dana Reed"
          />
          <Input
            id="client-email"
            label="Contact email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dana@acme.test"
          />
          <Input
            id="client-phone"
            label="Contact phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 0100"
          />
          <div>
            <label htmlFor="client-status" className="block text-sm font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              Status
            </label>
            <select
              id="client-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm shadow-sm"
            >
              {CLIENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {CLIENT_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          {formError && <div className="sm:col-span-2 text-xs font-bold text-rose-400 break-words">{formError}</div>}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" loading={busy} disabled={busy || !name.trim()}>
              Save client
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
