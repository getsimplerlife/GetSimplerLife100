import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";
interface PageSummary {
  id: string;
  name: string;
  description: string;
  timeZone: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  team: string[];
  availability: { dayOfWeek: number; startMinutes: number; endMinutes: number }[];
  status: string;
  shareUrl: string | null;
  version: number;
  updatedAt: string;
}
interface BookingSummary {
  id: string;
  bookingPageId: string;
  clientName: string;
  clientEmail: string;
  startAt: string;
  endAt: string;
  status: string;
  roundRobinAssignee: string | null;
  calendarSync: { provider: string; status: string };
}
interface PendingWrite {
  id: string;
  op: string;
  bookingPageId: string | null;
  bookingId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}
const PAGE_STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", archived: "Archived" };
const BOOKING_STATUS_LABEL: Record<string, string> = { requested: "Requested", confirmed: "Confirmed", cancelled: "Cancelled" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtSlot = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function BookingsPage() {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [slotDuration, setSlotDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [team, setTeam] = useState("");
  const [availability, setAvailability] = useState<{ dayOfWeek: number; startMinutes: number; endMinutes: number }[]>([]);
  const [availDay, setAvailDay] = useState(1);
  const [availStart, setAvailStart] = useState(9 * 60);
  const [availEnd, setAvailEnd] = useState(17 * 60);
  const [filterPage, setFilterPage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/native/booking", { credentials: "include" });
    if (!res.ok && res.status !== 401) throw new Error("Failed to load booking pages");
    if (res.ok) {
      const j = await res.json();
      setPages(j.data?.pages ?? []);
      setBookings(j.data?.bookings ?? []);
    }
    const wr = await fetch("/api/native/booking/writes", { credentials: "include" });
    if (wr.ok) setWrites((await wr.json()).data?.pendingWrites ?? []);
  }, []);
  useEffect(() => {
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  async function api(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `${method} failed`);
    return j.data ?? {};
  }

  async function createPage() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    setCreating(true);
    try {
      await api("POST", "/api/native/booking", {
        name: name.trim(),
        description: description.trim(),
        timeZone: timeZone.trim(),
        slotDurationMinutes: slotDuration,
        bufferMinutes: buffer,
        team: team.split(",").map((e) => e.trim()).filter(Boolean),
        availability,
      });
      setFeedback("Booking page created");
      setShowCreate(false);
      setName(""); setDescription(""); setTeam("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  const dayWindow = `${DAYS[availDay]} ${String(Math.floor(availStart / 60)).padStart(2, "0")}:${String(availStart % 60).padStart(2, "0")}–${String(Math.floor(availEnd / 60)).padStart(2, "0")}:${String(availEnd % 60).padStart(2, "0")}`;
  const pageName = (id: string) => pages.find((p) => p.id === id)?.name ?? id;
  if (loading) return <div className="p-10 text-center text-slate-500">Loading booking pages…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Booking pages</h1>
          <p className="text-sm text-slate-500">Self-serve scheduling pages. Clients book via the public link; you confirm (approval-gated) and the host is assigned round-robin.</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Cancel" : "New booking page"}</Button>
      </div>
      {error && <div className="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}
      {feedback && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{feedback}</div>}

      {showCreate && (
        <Card className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Time zone</label>
              <input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Slot duration</label>
              <select value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Buffer (min)</label>
              <input type="number" min={0} max={240} value={buffer} onChange={(e) => setBuffer(Math.max(0, Number(e.target.value)))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Round-robin team (emails, comma)</label>
              <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="host@example.com, …" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Availability (per day of week)</label>
            <div className="flex flex-wrap items-end gap-2">
              <select value={availDay} onChange={(e) => setAvailDay(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-2">
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <input type="time" value={`${String(Math.floor(availStart / 60)).padStart(2, "0")}:${String(availStart % 60).padStart(2, "0")}`} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setAvailStart(h * 60 + m); }} className="rounded-lg border border-slate-300 px-2 py-2" />
              <input type="time" value={`${String(Math.floor(availEnd / 60)).padStart(2, "0")}:${String(availEnd % 60).padStart(2, "0")}`} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setAvailEnd(h * 60 + m); }} className="rounded-lg border border-slate-300 px-2 py-2" />
              <Button onClick={() => { if (availStart < availEnd) setAvailability((a) => [...a, { dayOfWeek: availDay, startMinutes: availStart, endMinutes: availEnd }]); }}>Add</Button>
            </div>
            {availability.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {availability.map((w, i) => (
                  <span key={i} className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">
                    {DAYS[w.dayOfWeek]} {String(Math.floor(w.startMinutes / 60)).padStart(2, "0")}:{String(w.startMinutes % 60).padStart(2, "0")}–{String(Math.floor(w.endMinutes / 60)).padStart(2, "0")}:{String(w.endMinutes % 60).padStart(2, "0")}
                    <button className="ml-1 text-rose-500" onClick={() => setAvailability((a) => a.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <Button onClick={createPage} disabled={creating}>{creating ? "Creating…" : "Create"}</Button>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map((p) => (
          <Card key={p.id} className="space-y-2 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{p.name}</h2>
              <Badge>{PAGE_STATUS_LABEL[p.status] ?? p.status}</Badge>
            </div>
            <p className="text-xs text-slate-500">{p.timeZone} · {p.slotDurationMinutes}min{p.bufferMinutes ? ` + ${p.bufferMinutes}min buffer` : ""} · {p.availability.length} weekly window{p.availability.length === 1 ? "" : "s"}{p.team.length ? ` · ${p.team.length}-host round-robin` : ""}</p>
            {p.shareUrl && <p className="truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">{p.shareUrl}</p>}
            <div className="flex flex-wrap gap-2">
              {p.status === "draft" && <Button size="sm" onClick={async () => { try { await api("POST", `/api/native/booking/${p.id}/publish`); setFeedback("Publish queued/approved"); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Publish</Button>}
              {(p.status === "draft" || p.status === "published") && <Button size="sm" variant="secondary" onClick={async () => { try { await api("POST", `/api/native/booking/${p.id}/archive`); setFeedback("Archive queued/approved"); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Archive</Button>}
              {p.status === "draft" && <Button size="sm" variant="secondary" onClick={async () => { try { await api("DELETE", `/api/native/booking/${p.id}`); setFeedback("Deleted"); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Delete</Button>}
            </div>
          </Card>
        ))}
        {pages.length === 0 && <p className="text-sm text-slate-500">No booking pages yet — create one to get your public booking link.</p>}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Bookings</h2>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <label className="text-slate-500">Filter:</label>
          <select value={filterPage} onChange={(e) => setFilterPage(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1">
            <option value="">All pages</option>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <Card className="divide-y divide-slate-100">
          {bookings.filter((b) => !filterPage || b.bookingPageId === filterPage).map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{b.clientName} <span className="text-slate-400">·</span> <span className="text-slate-500">{b.clientEmail}</span></p>
                <p className="text-xs text-slate-500">{pageName(b.bookingPageId)} · {fmtSlot(b.startAt, pages.find((p) => p.id === b.bookingPageId)?.timeZone ?? "UTC")}{b.roundRobinAssignee ? ` · → ${b.roundRobinAssignee}` : ""} · calendar: {b.calendarSync?.status ?? "not-synced"} (Google Calendar adapter)</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{BOOKING_STATUS_LABEL[b.status] ?? b.status}</Badge>
                {b.status === "requested" && <Button size="sm" onClick={async () => { try { await api("POST", `/api/native/booking/bookings/${b.id}/confirm`); setFeedback("Confirm queued/approved"); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Confirm</Button>}
                {(b.status === "requested" || b.status === "confirmed") && <Button size="sm" variant="secondary" onClick={async () => { try { await api("POST", `/api/native/booking/bookings/${b.id}/cancel`); setFeedback("Cancel queued/approved"); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Cancel</Button>}
              </div>
            </div>
          ))}
          {bookings.filter((b) => !filterPage || b.bookingPageId === filterPage).length === 0 && <p className="px-5 py-3 text-sm text-slate-500">No bookings.</p>}
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Pending approvals</h2>
        <Card className="divide-y divide-slate-100">
          {writes.filter((w) => w.status === "pending").map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{w.op} {w.bookingPageId ? `· ${pageName(w.bookingPageId)}` : w.bookingId ? `· booking ${w.bookingId}` : ""}</p>
                <p className="text-xs text-slate-500">via {w.via} · {w.requestedBy} · {new Date(w.requestedAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={async () => { try { await api("POST", `/api/native/booking/writes/${w.id}/apply`); setFeedback("Applied"); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Approve</Button>
                <Button size="sm" variant="secondary" onClick={async () => { try { await api("POST", `/api/native/booking/writes/${w.id}/reject`); setFeedback("Rejected"); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>Reject</Button>
              </div>
            </div>
          ))}
          {writes.filter((w) => w.status === "pending").length === 0 && <p className="px-5 py-3 text-sm text-slate-500">Nothing pending.</p>}
        </Card>
      </div>
    </div>
  );
}
