/**
 * portal.forms.index.page.tsx — Phase 1.3 FORMS, surfaced in the portal.
 *
 * Slice 135: the forms router (/api/native/forms*) has been live and tested
 * since the 1.3 build, but no client file referenced it — a customer could not
 * reach it. This page is UI ONLY: it calls exactly the routes that exist.
 *
 *   GET    /api/native/forms                    → list (+ submission counts)
 *   POST   /api/native/forms                    → create (slug auto-generated)
 *   POST   /api/native/forms/:id/enable|disable → flip the public submit gate
 *   DELETE /api/native/forms/:id                → delete (empty forms only)
 *   GET    /api/native/forms/:id/submissions    → submissions for one form
 *   POST   /api/native/forms/:slug/submit       → PUBLIC submit lane (no session)
 *
 * Honest limits shown on the page (not hidden):
 *   - there is NO hosted public form page yet — the public lane is the POST
 *     endpoint itself, which an embed/script posts to (unknown or disabled
 *     slug → 404, fail-closed);
 *   - a form with submissions cannot be deleted (the router refuses it);
 *   - answers are shown exactly as recorded — nothing is re-typed or scored.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import { SignedOutNotice, ErrorLine, FeedbackLine } from "~/components/PortalPrimitiveShell";
import { authedJson, authedSend, FORM_FIELD_TYPES, cellText, formatWhen } from "~/lib/portal-primitives";

interface FormSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  steps: number;
  fields: number;
  prefillKeys: string[];
  enabled: boolean;
  submissions: number;
  createdAt: string;
  updatedAt: string;
}
interface SubmissionFile {
  key: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
}
interface Submission {
  id: string;
  formId: string;
  status: string;
  eventId: string;
  answers: Record<string, string | string[]>;
  files: SubmissionFile[];
  submittedAt: string;
  submittedBy: string;
  source: string;
}
interface FieldDraft {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options: string;
}

const EMPTY_FIELD: FieldDraft = { key: "", label: "", type: "text", required: false, options: "" };

function fieldPayload(draft: FieldDraft) {
  const options =
    draft.type === "select"
      ? draft.options.split(",").map((o) => o.trim()).filter(Boolean)
      : undefined;
  return {
    key: draft.key.trim(),
    label: draft.label.trim(),
    type: draft.type,
    ...(draft.required ? { required: true } : {}),
    ...(options && options.length > 0 ? { options } : {}),
  };
}

export default function FormsPage() {
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsFor, setSubmissionsFor] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [origin, setOrigin] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<FieldDraft[]>([{ ...EMPTY_FIELD, key: "name", label: "Your name" }]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    const res = await authedJson<{ forms: FormSummary[] }>("/api/native/forms");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setSignedOut(false);
    setError("");
    setForms(Array.isArray(res.data?.forms) ? res.data.forms : []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const loadSubmissions = useCallback(async (formId: string) => {
    setBusy(`subs:${formId}`);
    const res = await authedJson<Submission[]>(`/api/native/forms/${formId}/submissions`);
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setSelectedId(formId);
    setSubmissionsFor(formId);
    setSubmissions(Array.isArray(res.data) ? res.data : []);
  }, []);

  async function createForm() {
    setError("");
    setFeedback("");
    if (!name.trim()) {
      setError("Give the form a name first.");
      return;
    }
    const fields = drafts.map(fieldPayload).filter((f) => f.key && f.label);
    if (fields.length === 0) {
      setError("Add at least one field (key + label).");
      return;
    }
    setCreating(true);
    const res = await authedSend<{ id: string; slug: string }>("/api/native/forms", "POST", {
      name: name.trim(),
      description: description.trim(),
      steps: [{ title: "Details", fields }],
    });
    setCreating(false);
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(`Form created. Its public submit endpoint is live at /api/native/forms/${res.data.slug}/submit.`);
    setName("");
    setDescription("");
    setDrafts([{ ...EMPTY_FIELD, key: "name", label: "Your name" }]);
    await load();
  }

  async function toggle(form: FormSummary) {
    setError("");
    setFeedback("");
    const res = await authedSend<unknown>(
      `/api/native/forms/${form.id}/${form.enabled ? "disable" : "enable"}`,
      "POST",
    );
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(
      form.enabled
        ? `"${form.name}" disabled — its public submit endpoint now returns 404.`
        : `"${form.name}" enabled — its public submit endpoint accepts submissions again.`,
    );
    await load();
  }

  async function remove(form: FormSummary) {
    setError("");
    setFeedback("");
    const res = await authedSend<unknown>(`/api/native/forms/${form.id}`, "DELETE");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(`"${form.name}" deleted.`);
    if (selectedId === form.id) {
      setSelectedId(null);
      setSubmissionsFor(null);
      setSubmissions([]);
    }
    await load();
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${label} copied to the clipboard.`);
    } catch {
      setFeedback(`${label}: ${text}`);
    }
  }

  function submitEndpoint(slug: string): string {
    return `${origin}/api/native/forms/${slug}/submit`;
  }

  if (signedOut) return <SignedOutNotice surface="Forms" />;

  const selected = forms.find((f) => f.id === submissionsFor) ?? null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Forms</h1>
        <p className="text-sm text-stone-500">
          Native forms with a public submit lane. A submission is recorded once (idempotent by submission id), stored
          with any uploaded files, and published as the typed event <code>native.form.submission</code> for your
          webhook subscriptions.
        </p>
      </div>

      <ErrorLine message={error} />
      <FeedbackLine message={feedback} />

      <Card id="form-composer">
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Create a form</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Name
              <input
                className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client intake"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Description
              <input
                className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this form is for (optional)"
              />
            </label>
          </div>

          <div className="mt-4 space-y-2">
            {drafts.map((draft, i) => (
              <div key={i} className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
                <input
                  className="rounded border p-2 text-sm text-stone-900"
                  placeholder="field_key"
                  value={draft.key}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, key: e.target.value } : d)))
                  }
                />
                <input
                  className="rounded border p-2 text-sm text-stone-900"
                  placeholder="Label"
                  value={draft.label}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, label: e.target.value } : d)))
                  }
                />
                <select
                  className="rounded border p-2 text-sm text-stone-900"
                  value={draft.type}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, type: e.target.value } : d)))
                  }
                >
                  {FORM_FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-stone-500">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(e) =>
                      setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, required: e.target.checked } : d)))
                    }
                  />
                  required
                </label>
                <button
                  type="button"
                  className="text-xs text-rose-500 underline"
                  onClick={() => setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))}
                >
                  Remove
                </button>
                {draft.type === "select" && (
                  <input
                    className="rounded border p-2 text-sm text-stone-900 sm:col-span-5"
                    placeholder="Options, comma separated"
                    value={draft.options}
                    onChange={(e) =>
                      setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, options: e.target.value } : d)))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDrafts((prev) => [...prev, { ...EMPTY_FIELD }])}
            >
              Add field
            </Button>
            <Button onClick={createForm} disabled={creating}>
              {creating ? "Creating…" : "Create form"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Field keys are slugs (<code>[A-Za-z0-9_-]</code>). The form is created enabled — disable it any time to make
            the public submit endpoint fail closed.
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Your forms ({forms.length})</h2>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : forms.length === 0 ? (
            <PortalEmptyState
              title="No forms yet"
              body="Create your first form above — it gets a public submit endpoint the moment it exists."
              action={{ label: "Open the form builder", onClick: () => scrollToId("form-composer") }}
            />
          ) : (
            <div className="space-y-3">
              {forms.map((f) => (
                <div key={f.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{f.name}</span>
                        <Badge variant={f.enabled ? "success" : "stone"}>{f.enabled ? "Accepting" : "Disabled"}</Badge>
                      </div>
                      <p className="text-sm text-stone-500">
                        {f.fields} field{f.fields === 1 ? "" : "s"} · {f.steps} step{f.steps === 1 ? "" : "s"} ·{" "}
                        {f.submissions} submission{f.submissions === 1 ? "" : "s"} · updated {formatWhen(f.updatedAt)}
                      </p>
                      {f.description && <p className="text-xs text-stone-400">{f.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="max-w-full truncate rounded bg-stone-100 px-2 py-1 text-xs text-stone-700">
                          POST {submitEndpoint(f.slug)}
                        </code>
                        <button
                          type="button"
                          className="text-xs text-sky-600 underline"
                          onClick={() => copy(submitEndpoint(f.slug), "Public submit endpoint")}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadSubmissions(f.id)}
                        disabled={busy === `subs:${f.id}`}
                      >
                        {busy === `subs:${f.id}` ? "Loading…" : "View submissions"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggle(f)}>
                        {f.enabled ? "Disable" : "Enable"}
                      </Button>
                      {f.submissions === 0 && (
                        <Button size="sm" variant="danger" onClick={() => remove(f)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                  {f.submissions > 0 && (
                    <p className="mt-1 text-xs text-stone-400">
                      A form with submissions cannot be deleted — delete its submissions first (via the API) or disable it.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-stone-500">
            The public submit lane is the endpoint itself: <code>POST /api/native/forms/&lt;slug&gt;/submit</code>. There is
            no hosted public form page yet, so an embed or script posts to that URL. Unknown or disabled slugs return 404.
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">
            Submissions{selected ? ` — ${selected.name}` : ""} ({submissions.length})
          </h2>
          {!selected ? (
            <PortalEmptyState
              title="Pick a form to see its submissions"
              body="Submissions are listed per form. Use “View submissions” on a form above."
              compact
            />
          ) : submissions.length === 0 ? (
            <PortalEmptyState
              title="No submissions yet"
              body={`Nothing has been posted to /api/native/forms/${selected.slug}/submit yet. Submissions appear here the moment one is accepted.`}
              compact
            />
          ) : (
            <div className="space-y-3">
              {submissions.map((s) => (
                <div key={s.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{formatWhen(s.submittedAt)}</span>
                    <span className="text-xs text-stone-500">
                      {s.submittedBy || "anonymous"} · {s.source || "native-form"} · status {s.status}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {Object.entries(s.answers || {}).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <dt className="text-stone-500">{key}:</dt>
                        <dd className="min-w-0 break-words">{cellText(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  {(s.files?.length ?? 0) > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {s.files.map((file) => (
                        <li key={file.key}>
                          <a
                            className="text-sky-600 underline"
                            href={`/api/native/forms/submissions/${s.id}/download?key=${encodeURIComponent(file.key)}`}
                          >
                            {file.name || file.key}
                          </a>{" "}
                          <span className="text-stone-400">
                            {file.contentType} · {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
