import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";

interface PageSummary {
  name: string;
  description: string;
  timeZone: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  availability: string[];
  teamSize: number;
  calendarSyncLabel: string;
}

const fmt = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function BookingSharePage() {
  const { slug } = useParams({ from: "/bookings/share/$slug" });
  const [page, setPage] = useState<PageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ status: string } | null>(null);

  useEffect(() => {
    fetch(`/api/native/booking/share/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Booking page not found");
        return (await r.json()).data as PageSummary;
      })
      .then(setPage)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!date || !page) return;
    setSlot("");
    fetch(`/api/native/booking/share/${slug}/slots?date=${date}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load availability");
        const j = await r.json();
        setSlots(j.data?.slots ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [date, page, slug]);

  async function submit() {
    if (!slot || !name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError("Enter your name, email and choose a time slot");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/native/booking/share/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: name.trim(), clientEmail: email.trim(), startAt: slot }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Request failed");
      setDone({ status: j.data?.status ?? "pending" });
      // Fall through: nothing further exposed to the client.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-10 text-center text-slate-500">Loading booking page…</div>;
  if (error && !page) return <div className="p-10 text-center text-slate-500">{error}</div>;
  if (!page) return null;

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-emerald-900">{done.status === "applied" ? "Booking confirmed" : "Booking request received"}</h1>
          <p className="mt-2 text-emerald-800">
            {done.status === "applied"
              ? "Your time is reserved. The host will see it and confirm any remaining details."
              : "Your request is pending confirmation. The host will confirm your time shortly."}
          </p>
          <Link to="/" className="mt-6 inline-block font-medium text-emerald-700 underline">Back to home</Link>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{page.name}</h1>
        {page.description && <p className="mt-2 whitespace-pre-wrap text-slate-600">{page.description}</p>}
        <p className="mt-2 text-sm text-slate-500">
          {page.slotDurationMinutes}-minute slot{page.bufferMinutes ? ` · ${page.bufferMinutes}-minute buffer` : ""} · {page.timeZone}
          {page.teamSize > 0 ? ` · ${page.teamSize} host${page.teamSize > 1 ? "s" : ""} (rotating)` : ""}
        </p>

        {page.availability.length > 0 ? (
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Pick a date</label>
              <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </div>
            {date && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Available times{slots.length === 0 ? " — none available that day" : ""}</label>
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlot(s)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium ${slot === s ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"}`}
                    >
                      {fmt(s, page.timeZone).split(", ").slice(1).join(" ")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Your email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
              </div>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button onClick={submit} disabled={submitting} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? "Requesting…" : "Request this time"}
            </button>
            <p className="text-xs text-slate-400">{page.calendarSyncLabel}</p>
          </div>
        ) : (
          <p className="mt-6 text-slate-500">No availability published yet.</p>
        )}
      </div>
    </div>
  );
}
