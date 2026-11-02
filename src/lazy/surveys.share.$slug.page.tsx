import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Card, Button } from "~/components/ui";
import { surveyPublicApiPath, surveyPublicSubmitPath } from "~/lib/share-links";

/**
 * SLICE 181 — the page a survey RESPONDENT opens.
 *
 * THE GAP THIS CLOSES. `/portal/surveys` handed the tenant a link to
 * `/api/native/survey/share/<slug>` — the JSON endpoint. The tenant copied it,
 * sent it to a client, and the client got `{"data":{...}}`: no title, no
 * questions, no form. The server lane was already finished and public
 * (src/native/survey/router.ts handleNativeSurveyShare, wired before the session
 * check), so the only thing missing was a page on top of it.
 *
 * WHAT THIS PAGE PROMISES, and what it refuses to claim:
 *  - It shows only the server's public projection: { title, description, kind,
 *    questions: [{ id, label, kind, required }] }. No token, no tenant id, no
 *    internal id beyond the question ids the answers must be keyed by.
 *  - A 404 is a real "this survey isn't available" page. A 5xx or a network
 *    failure is an error page with a retry — NEVER an empty survey. An empty
 *    form would be the lie: it looks answerable and records nothing.
 *  - `required` is enforced here for the respondent's benefit, but the server is
 *    the authority: when it rejects, its own message is printed verbatim.
 *  - The three outcomes stay distinct. `recorded` says recorded. `pending` (202)
 *    says the response was RECEIVED and is waiting for approval — it never says
 *    "recorded", because nothing is in the survey yet at that point.
 *  - A question whose `kind` this page does not understand is shown as
 *    unanswerable and BLOCKS submission. Dropping it from the payload would
 *    submit a partial response and then print a success message for answers the
 *    respondent never gave.
 *
 * SSR: the slug comes from the router (`useParams`), never `window.location`,
 * for the same reason as slice 166 — a `window` read while rendering throws on
 * the server and demotes the page to client-only rendering.
 */

interface PublicQuestion {
  id: string;
  label: string;
  /** "nps" | "rating" | "text" on the server; typed loosely because the
   *  projection is remote input and an unknown kind must not crash the page. */
  kind: string;
  required: boolean;
}

interface PublicSurvey {
  title: string;
  description: string;
  kind: string;
  questions: PublicQuestion[];
}

const NPS_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RATING_CHOICES = [1, 2, 3, 4, 5];

const SUPPORTED_KINDS = new Set(["nps", "rating", "text"]);

type Phase = "loading" | "ready" | "not-found" | "error";
type Outcome = "recorded" | "pending";

/** A question is answerable only when this page knows how to render it. */
function isSupported(q: PublicQuestion): boolean {
  return SUPPORTED_KINDS.has(q.kind);
}

function answered(q: PublicQuestion, raw: string | undefined): boolean {
  if (raw === undefined) return false;
  return q.kind === "text" ? raw.trim().length > 0 : raw !== "";
}

export default function SurveyRespondentPage() {
  const { slug } = useParams({ from: "/surveys/share/$slug" });
  const [phase, setPhase] = useState<Phase>("loading");
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setLoadError("");
    fetch(surveyPublicApiPath(slug), { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (cancelled) return;
        // 404 is the server's "unknown, unpublished or foreign slug" answer —
        // indistinguishable on purpose, so the page says one plain thing.
        if (res.status === 404) {
          setPhase("not-found");
          return;
        }
        const body = (await res.json().catch(() => null)) as { data?: PublicSurvey; error?: string } | null;
        if (!res.ok) {
          setLoadError(body?.error || `The server answered with HTTP ${res.status}.`);
          setPhase("error");
          return;
        }
        const data = body?.data;
        // Never fall back to an empty survey: a payload we cannot read is an
        // error the respondent can retry, not a form that submits nothing.
        if (!data || typeof data.title !== "string" || !Array.isArray(data.questions)) {
          setLoadError("The survey arrived in a form this page cannot read.");
          setPhase("error");
          return;
        }
        setSurvey({
          title: data.title,
          description: typeof data.description === "string" ? data.description : "",
          kind: typeof data.kind === "string" ? data.kind : "",
          questions: data.questions.filter(
            (q): q is PublicQuestion => !!q && typeof q.id === "string" && typeof q.label === "string",
          ),
        });
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

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setMissing((prev) => (prev[id] ? { ...prev, [id]: false } : prev));
  };

  const unsupported = (survey?.questions ?? []).filter((q) => !isSupported(q));

  const submit = async () => {
    if (!survey) return;
    setSubmitError("");

    const unanswered: Record<string, boolean> = {};
    for (const q of survey.questions) {
      if (q.required && !answered(q, answers[q.id])) unanswered[q.id] = true;
    }
    setMissing(unanswered);
    if (Object.keys(unanswered).length > 0) return;
    // An unrenderable question blocks the whole submission (see the header).
    if (unsupported.length > 0) return;

    // Only questions the respondent actually answered are sent; the server
    // re-checks every id and every range, and rejects the request if a required
    // question is missing.
    const payload: Record<string, number | string> = {};
    for (const q of survey.questions) {
      const raw = answers[q.id];
      if (!answered(q, raw)) continue;
      payload[q.id] = q.kind === "text" ? raw : Number(raw);
    }

    setSubmitting(true);
    try {
      const res = await fetch(surveyPublicSubmitPath(slug), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: payload, comment: comment.trim() }),
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { status?: string }; error?: string }
        | null;
      const status = body?.data?.status;
      // 202 / "pending" is the approval-gated lane: received, NOT recorded.
      if (res.status === 202 || status === "pending") {
        setOutcome("pending");
        return;
      }
      if (res.ok && status === "recorded") {
        setOutcome("recorded");
        return;
      }
      if (res.ok) {
        // Accepted with an answer we do not understand — do not invent success.
        setSubmitError(`The server accepted the request but did not say what happened (HTTP ${res.status}).`);
        return;
      }
      // The server is the authority on why it refused (400 validation, 429 rate
      // limit, 404 withdrawn): print its own words, never a generic apology.
      setSubmitError(body?.error || `The server refused the response (HTTP ${res.status}).`);
    } catch {
      setSubmitError("We could not reach the server. Your answers are still on this page — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === "loading") {
    return <div className="p-8 text-gray-500">Loading survey…</div>;
  }

  if (phase === "not-found") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">This survey isn&apos;t available</h1>
          <p className="mt-2 text-sm text-gray-600">
            The link may be out of date, or the sender has closed the survey. Ask them to send you a fresh link.
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "error" || !survey) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">We couldn&apos;t load this survey</h1>
          <p className="mt-2 text-sm text-gray-600">{loadError || "The survey could not be loaded."}</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (outcome === "recorded") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">Thanks — your response was recorded.</h1>
          <p className="mt-2 text-sm text-gray-600">Nothing else is needed. You can close this page.</p>
        </Card>
      </div>
    );
  }

  if (outcome === "pending") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold">Thanks — your response was received.</h1>
          <p className="mt-2 text-sm text-gray-600">
            It is waiting for the sender to approve it. Nothing has been saved yet; it will count once they approve.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card className="p-6">
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        {survey.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{survey.description}</p>
        ) : null}

        {survey.questions.length === 0 ? (
          <p className="mt-6 text-sm text-gray-600">
            This survey has no questions yet, so there is nothing to send. Ask the sender to finish it.
          </p>
        ) : (
          <form
            className="mt-6 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {survey.questions.map((q, i) => {
              const legend = (
                <legend className="text-sm font-medium">
                  {q.label}
                  {q.required ? <span className="ml-1 text-red-600">*</span> : null}
                </legend>
              );
              const note = missing[q.id] ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  Please answer this question — the sender marked it required.
                </p>
              ) : null;

              if (q.kind === "nps" || q.kind === "rating") {
                const choices = q.kind === "nps" ? NPS_CHOICES : RATING_CHOICES;
                return (
                  <fieldset key={q.id} className="border-0 p-0" aria-label={q.label}>
                    {legend}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {choices.map((n) => (
                        <label
                          key={n}
                          className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs ${
                            answers[q.id] === String(n)
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-gray-300 text-gray-700"
                          }`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={q.id}
                            value={n}
                            checked={answers[q.id] === String(n)}
                            onChange={() => setAnswer(q.id, String(n))}
                          />
                          {n}
                        </label>
                      ))}
                    </div>
                    {note}
                  </fieldset>
                );
              }

              if (q.kind === "text") {
                const id = `survey-q-${i}`;
                return (
                  <div key={q.id}>
                    <label htmlFor={id} className="text-sm font-medium">
                      {q.label}
                      {q.required ? <span className="ml-1 text-red-600">*</span> : null}
                    </label>
                    <textarea
                      id={id}
                      className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      rows={3}
                      maxLength={2000}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                    />
                    {note}
                  </div>
                );
              }

              // Unknown kind: say so, and do not pretend it can be answered.
              return (
                <div key={q.id} className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">{q.label}</p>
                  <p className="mt-1 text-xs text-amber-800">
                    This question uses a format this page can&apos;t display ({q.kind || "unspecified"}), so it can&apos;t
                    be answered here. Nothing can be sent until the sender fixes it.
                  </p>
                </div>
              );
            })}

            <div>
              <label htmlFor="survey-comment" className="text-sm font-medium">
                Anything else you&apos;d like to add? (optional)
              </label>
              <textarea
                id="survey-comment"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                rows={3}
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            {submitError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {submitError}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={submitting || unsupported.length > 0} loading={submitting}>
                Send my response
              </Button>
              {unsupported.length > 0 ? (
                <span className="text-xs text-amber-800">
                  Sending is disabled because this survey includes a question this page can&apos;t display.
                </span>
              ) : null}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
