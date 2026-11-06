import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Card, Button } from "~/components/ui";
import { bookingPublicApiPath, bookingSlotsApiPath } from "~/lib/share-links";

/**
 * SLICE 192b-2 — the page a booking CLIENT opens.
 *
 * Rebuilt to the survey page's shape (`surveys.share.$slug.page.tsx:95-127`):
 * four phases — `loading` / `ready` / `not-available` (a real 404) / `error` +
 * retry (anything else, including a payload this page cannot read).
 *
 * WHAT WAS WRONG, and what this page now refuses to do:
 *  - `return null` on an unreadable 200 (`:84`) rendered a BLANK WHITE PAGE. A
 *    payload that is not the shape this page renders is now the error phase.
 *  - A failed availability read left the PREVIOUS date's times on screen
 *    (`:43-53`), still clickable; the client then picked one and the server
 *    answered "that time slot is no longer available" — which was false. Slots
 *    are cleared before every read and left empty on failure, with the failure
 *    printed as an error.
 *  - Nothing compared a slot to "now" (`:119`, `:134`), so a time that had
 *    already passed was offered. Past slots are filtered out of the list.
 *  - Every published page carried a "confirmed bookings sync to your calendar
 *    through the connected adapter (verified integration)" sentence. No sync is
 *    executed, the confirm path never calls an adapter and no tenant can
 *    connect one — the sentence is GONE. Nothing on this page claims a calendar.
 *  - The load error was styled as body copy. It is an error, with a retry.
 *
 * SSR: the slug comes from the router (`useParams`), never `window.location`
 * (slice 166).
 */

interface PageSummary {
  name: string;
  description: string;
  /** The host firm's display name; null when the workspace has not set one. */
  hostName: string | null;
  timeZone: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  availability: string[];
  teamSize: number;
}

type Phase = "loading" | "ready" | "not-available" | "error";

const slotFormatter = (tz: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** "Mon, Nov 10, 09:00 AM" — the weekday is part of what a slot IS. */
function slotLabel(iso: string, tz: string): string {
  try {
    return slotFormatter(tz).format(new Date(iso));
  } catch {
    // An unknown time zone must not blank the list; show the instant as-is.
    return iso;
  }
}

/** Today's calendar date in the PAGE's time zone — not the browser's UTC day. */
function todayInTimeZone(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year");
    const m = get("month");
    const d = get("day");
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fall through to the machine's own day
  }
  return new Date().toISOString().slice(0, 10);
}

/** The public projection, validated. Anything else is `null` → the error phase. */
function parsePage(raw: unknown): PageSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.timeZone !== "string") return null;
  if (!Array.isArray(r.availability)) return null;
  return {
    name: r.name,
    description: typeof r.description === "string" ? r.description : "",
    hostName: typeof r.hostName === "string" && r.hostName.length > 0 ? r.hostName : null,
    timeZone: r.timeZone,
    slotDurationMinutes: Number.isFinite(Number(r.slotDurationMinutes)) ? Number(r.slotDurationMinutes) : 0,
    bufferMinutes: Number.isFinite(Number(r.bufferMinutes)) ? Number(r.bufferMinutes) : 0,
    availability: r.availability.filter((w): w is string => typeof w === "string"),
    teamSize: Number.isFinite(Number(r.teamSize)) ? Number(r.teamSize) : 0,
  };
}

export default function BookingSharePage() {
  const { slug } = useParams({ from: "/bookings/share/$slug" });

  const [phase, setPhase] = useState<Phase>("loading");
  const [page, setPage] = useState<PageSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsError, setSlotsError] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsAttempt, setSlotsAttempt] = useState(0);
  const [slot, setSlot] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState<{ status: string; bookingStatus: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setLoadError("");
    fetch(bookingPublicApiPath(slug), { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        // 404 is the server's "unknown, unpublished or foreign slug" answer.
        if (res.status === 404) {
          setPhase("not-available");
          return;
        }
        const body = (await res.json().catch(() => null)) as { data?: unknown; error?: string } | null;
        if (!res.ok) {
          setLoadError(body?.error || `The server answered with HTTP ${res.status}.`);
          setPhase("error");
          return;
        }
        const parsed = parsePage(body?.data);
        // Never render nothing: an unreadable payload is an error the client can
        // retry, not a blank page.
        if (!parsed) {
          setLoadError("The booking page arrived in a form this page cannot read.");
          setPhase("error");
          return;
        }
        setPage(parsed);
        setPhase("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("We could not reach the server. Check your connection and try again.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  useEffect(() => {
    if (!date || !page) return;
    let cancelled = false;
    // Clear BEFORE the read and leave it empty if the read fails: a time from
    // another day is not an offer, and the server would refuse it.
    setSlots([]);
    setSlot("");
    setSlotsError("");
    setSlotsLoading(true);
    const now = Date.now();
    fetch(bookingSlotsApiPath(slug, date), { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        const body = (await res.json().catch(() => null)) as
          | { data?: { slots?: unknown }; error?: string }
          | null;
        if (!res.ok) {
          setSlotsError(body?.error || `The server answered with HTTP ${res.status}.`);
          return;
        }
        const raw = body?.data?.slots;
        if (!Array.isArray(raw)) {
          setSlotsError("The availability arrived in a form this page cannot read.");
          return;
        }
        // A time that has already passed cannot be booked.
        const usable = raw.filter(
          (s): s is string => typeof s === "string" && Number.isFinite(Date.parse(s)) && Date.parse(s) > now,
        );
        setSlots(usable);
      })
      .catch(() => {
        if (cancelled) return;
        setSlotsError("We could not load the available times. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, page, slug, slotsAttempt]);

  async function submit() {
    if (!slot || !name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setSubmitError("Enter your name, email and choose a time slot");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(bookingPublicApiPath(slug), {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ clientName: name.trim(), clientEmail: email.trim(), startAt: slot }),
      });
      const j = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(j.error || `The server refused the request (HTTP ${res.status}).`);
      setDone({
        status: (j.data?.status as string | undefined) ?? "pending",
        bookingStatus: (j.data?.bookingStatus as string | null | undefined) ?? null,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return <div className="p-10 text-center text-slate-500">Loading booking page…</div>;
  }

  if (phase === "not-available") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Card className="p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900">This booking page isn&apos;t available</h1>
          <p className="mt-2 text-slate-600">
            The link may be out of date, or the host has unpublished the page. Ask them to send you a fresh link.
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "error" || !page) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8" role="alert">
          <h1 className="text-xl font-semibold text-rose-900">We couldn&apos;t load this booking page</h1>
          <p className="mt-2 text-rose-800">{loadError || "The booking page could not be loaded."}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    /**
     * SLICE 182 — "applied" is the WRITE outcome, not the booking's status. The
     * record this lane creates is `status: "requested"` (native/booking/gate.ts),
     * so "Booking confirmed" claimed a confirmation nobody had made. The page
     * prints what the record says: a confirmation only when the server reports
     * `confirmed`, and "your time is reserved" only when a record exists
     * (`requested` — availability.ts counts it as busy). A merely pending write
     * holds nothing, so it promises nothing.
     */
    const confirmed = done.bookingStatus === "confirmed";
    const held = done.bookingStatus === "requested";
    const headline = confirmed
      ? "Booking confirmed"
      : held
        ? "Booking request received — your time is reserved"
        : "Booking request received";
    const body = confirmed
      ? "Your time is reserved and confirmed. The host will be in touch with any remaining details."
      : held
        ? "Your time is held for you. The host has your request and will confirm any remaining details."
        : "Your request is pending confirmation. The host will confirm your time shortly.";
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-emerald-900">{headline}</h1>
          <p className="mt-2 text-emerald-800">{body}</p>
          <Link to="/" className="mt-6 inline-block font-medium text-emerald-700 underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const today = todayInTimeZone(page.timeZone);
  const selectedLabel = slot ? slotLabel(slot, page.timeZone) : "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{page.name}</h1>
        {page.hostName ? <p className="mt-1 text-sm font-medium text-slate-600">with {page.hostName}</p> : null}
        {page.description && <p className="mt-2 whitespace-pre-wrap text-slate-600">{page.description}</p>}
        <p className="mt-2 text-sm text-slate-500">
          {page.slotDurationMinutes}-minute slot{page.bufferMinutes ? ` · ${page.bufferMinutes}-minute buffer` : ""} ·{" "}
          {page.timeZone}
          {page.teamSize > 0 ? ` · ${page.teamSize} host${page.teamSize > 1 ? "s" : ""} (rotating)` : ""}
        </p>

        {page.availability.length > 0 ? (
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="booking-date" className="mb-1 block text-sm font-medium text-slate-700">
                Pick a date
              </label>
              <input
                id="booking-date"
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            {date && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Available times
                  {!slotsLoading && !slotsError && slots.length === 0 ? " — none available that day" : ""}
                </label>
                {slotsError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2" role="alert">
                    <p className="text-sm text-rose-800">{slotsError}</p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-rose-900 underline"
                      onClick={() => setSlotsAttempt((n) => n + 1)}
                    >
                      Try again
                    </button>
                  </div>
                ) : slotsLoading ? (
                  <p className="text-sm text-slate-500">Loading times…</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSlot(s)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          slot === s
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"
                        }`}
                      >
                        {slotLabel(s, page.timeZone)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="booking-name" className="mb-1 block text-sm font-medium text-slate-700">
                  Your name
                </label>
                <input
                  id="booking-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="booking-email" className="mb-1 block text-sm font-medium text-slate-700">
                  Your email
                </label>
                <input
                  id="booking-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            {selectedLabel ? <p className="text-sm text-slate-600">You are asking for {selectedLabel}.</p> : null}
            {submitError ? (
              <p className="text-sm text-rose-600" role="alert">
                {submitError}
              </p>
            ) : null}
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Requesting…" : "Request this time"}
            </button>
          </div>
        ) : (
          <p className="mt-6 text-slate-500">No availability published yet.</p>
        )}
      </div>
    </div>
  );
}
