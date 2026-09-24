import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

// ── Types (Phase 3.4 native surveys — NPS / CSAT / scorecard / custom) ─────
interface QuestionDraft {
  label: string;
  kind: "nps" | "rating" | "text";
  required: boolean;
  dimension?: string;
}
interface SurveySummary {
  id: string;
  name: string;
  description: string;
  kind: string;
  status: string;
  slug: string;
  questionCount: number;
  responseCount: number;
  createdAt: string;
}
interface SurveyFull {
  id: string;
  name: string;
  description: string;
  kind: string;
  status: string;
  slug: string;
  questions: Array<{ id: string; label: string; kind: string; required: boolean; dimension?: string }>;
}
interface PendingWrite {
  id: string;
  surveyId: string | null;
  op: string;
  status: string;
  approvalActionId: string;
  requestedAt: string;
}
interface Stats {
  total: number;
  pending: number;
  nps: number | null;
  csatAvg: number | null;
  perQuestion: Record<string, { avg: number | null; count: number }>;
  comments: Array<{ at: string; comment: string }>;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

const KIND_LABEL: Record<string, string> = { nps: "NPS", csat: "CSAT", scorecard: "Scorecard", custom: "Custom" };

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveySummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [selected, setSelected] = useState<SurveyFull | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // builder state
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftKind, setDraftKind] = useState("csat");
  const [draftQuestions, setDraftQuestions] = useState<QuestionDraft[]>([
    { label: "How satisfied were you with our work? (1-5)", kind: "rating", required: true },
  ]);

  const load = useCallback(async () => {
    try {
      const d = await api<{ data: { surveys: SurveySummary[] } }>("GET", "/api/native/survey");
      setSurveys(d.data.surveys);
      const w = await api<{ data: { writes: PendingWrite[] } }>("GET", "/api/native/survey/writes");
      setWrites(w.data.writes);
      setError("");
      if (selected) {
        const f = await api<{ data: { survey: SurveyFull; stats: Stats } }>("GET", `/api/native/survey/${selected.id}`);
        setSelected(f.data.survey);
        setStats(f.data.stats);
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (path: string, okMsg: string) => {
    setNotice("");
    try {
      const r = await api<{ data: { status: string } }>("POST", path);
      setNotice(`${okMsg} (${r.data.status === "pending" ? "queued for approval" : r.data.status})`);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const createSurvey = async () => {
    setError("");
    setNotice("");
    try {
      const r = await api<{ data: { status: string; surveyId?: string } }>("POST", "/api/native/survey", {
        name: draftName,
        description: draftDesc,
        kind: draftKind,
        questions: draftQuestions.map((q) => ({ label: q.label, kind: q.kind, required: q.required, dimension: q.dimension ?? undefined })),
      });
      setNotice(`Survey ${r.data.status === "pending" ? "queued for approval" : "created"}.`);
      setDraftName("");
      setDraftDesc("");
      setDraftQuestions([{ label: "How satisfied were you with our work? (1-5)", kind: "rating", required: true }]);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const applyWrite = (w: PendingWrite) => act(`/api/native/survey/writes/${w.id}/apply`, "Approved");
  const rejectWrite = (w: PendingWrite) => act(`/api/native/survey/writes/${w.id}/reject`, "Rejected");
  const openSurvey = async (s: SurveySummary) => {
    const f = await api<{ data: { survey: SurveyFull; stats: Stats } }>("GET", `/api/native/survey/${s.id}`);
    setSelected(f.data.survey);
    setStats(f.data.stats);
  };

  const shareUrl = selected ? `${window.location.origin}/api/native/survey/share/${selected.slug}` : "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Surveys &amp; feedback</h1>
        <p className="mt-1 text-sm text-slate-500">
          Build NPS / CSAT / interview-scorecard surveys, share a public link, and review every response before it is
          recorded. All writes are approval-gated.
        </p>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {/* Pending responses / lifecycle writes */}
      {writes.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Pending approvals</h2>
            <Badge variant="warning">{writes.length}</Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {writes.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-slate-800">
                    {w.op === "submit" ? "New survey response" : `${w.op} survey ${w.surveyId ?? ""}`}
                  </p>
                  <p className="text-xs text-slate-400">Requested {new Date(w.requestedAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => void applyWrite(w)}>
                    Approve
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void rejectWrite(w)}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Builder */}
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">New survey</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Survey name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <input
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Description (optional)"
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
          />
          <select className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={draftKind} onChange={(e) => setDraftKind(e.target.value)}>
            <option value="csat">CSAT (1-5)</option>
            <option value="nps">NPS (0-10)</option>
            <option value="scorecard">Interview scorecard</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="mt-3 space-y-2">
          {draftQuestions.map((q, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Question"
                value={q.label}
                onChange={(e) => {
                  const next = [...draftQuestions];
                  next[i] = { ...q, label: e.target.value };
                  setDraftQuestions(next);
                }}
              />
              <select
                className="rounded-md border border-slate-200 px-2 py-2 text-sm"
                value={q.kind}
                onChange={(e) => {
                  const next = [...draftQuestions];
                  next[i] = { ...q, kind: e.target.value as QuestionDraft["kind"] };
                  setDraftQuestions(next);
                }}
              >
                <option value="rating">Rating 1-5</option>
                <option value="nps">NPS 0-10</option>
                <option value="text">Open text</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => {
                    const next = [...draftQuestions];
                    next[i] = { ...q, required: e.target.checked };
                    setDraftQuestions(next);
                  }}
                />
                required
              </label>
              <Button variant="ghost" size="sm" onClick={() => setDraftQuestions(draftQuestions.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraftQuestions([...draftQuestions, { label: "", kind: "text", required: false }])}
          >
            + Add question
          </Button>
          <Button variant="primary" size="sm" onClick={() => void createSurvey()}>
            Create survey
          </Button>
        </div>
      </Card>

      {/* Survey list */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Surveys</h2>
          <Badge variant="stone">{surveys.length}</Badge>
        </div>
        {surveys.length === 0 ? (
          <p className="text-sm text-slate-400">No surveys yet — build your first one above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {surveys.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{s.name}</p>
                    <Badge variant="stone">{KIND_LABEL[s.kind] ?? s.kind}</Badge>
                    <Badge variant={s.status === "published" ? "success" : s.status === "archived" ? "stone" : "warning"}>{s.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {s.questionCount} questions · {s.responseCount} responses
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status === "draft" && (
                    <Button size="sm" onClick={() => void act(`/api/native/survey/${s.id}/publish`, "Publish")}>
                      Publish
                    </Button>
                  )}
                  {s.status === "published" && (
                    <Button size="sm" onClick={() => void act(`/api/native/survey/${s.id}/archive`, "Archive")}>
                      Archive
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void openSurvey(s)}>
                    Open
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Selected survey: share link + stats */}
      {selected && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">{selected.name}</h2>
          {selected.status === "published" && (
            <div className="mt-2 flex items-center gap-2">
              <input readOnly value={shareUrl} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(shareUrl).then(() => setNotice("Share link copied."));
                }}
              >
                Copy
              </Button>
            </div>
          )}
          {stats && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Responses recorded</p>
                <p className="text-lg font-semibold text-slate-900">{stats.total}</p>
              </div>
              {stats.nps !== null && (
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">NPS</p>
                  <p className="text-lg font-semibold text-slate-900">{stats.nps}</p>
                </div>
              )}
              {stats.csatAvg !== null && (
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">CSAT average</p>
                  <p className="text-lg font-semibold text-slate-900">{stats.csatAvg} / 5</p>
                </div>
              )}
              {stats.pending > 0 && (
                <div className="rounded-md bg-amber-50 p-3">
                  <p className="text-xs text-amber-600">Pending review</p>
                  <p className="text-lg font-semibold text-amber-800">{stats.pending}</p>
                </div>
              )}
            </div>
          )}
          {stats && Object.keys(stats.perQuestion).length > 0 && (
            <div className="mt-4 rounded-md bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Per-question averages</p>
              <ul className="text-xs text-slate-700">
                {selected.questions.map((q) => {
                  const cur = stats.perQuestion[q.id];
                  return (
                    <li key={q.id} className="py-0.5">
                      {q.label} — {cur ? `${cur.avg} (${cur.count})` : "no ratings yet"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {stats && stats.comments.length > 0 && (
            <div className="mt-4 rounded-md bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Comments ({stats.comments.length})</p>
              <ul className="max-h-40 space-y-2 overflow-auto text-xs text-slate-700">
                {stats.comments.slice().reverse().map((c, i) => (
                  <li key={i} className="rounded bg-white p-2">
                    “{c.comment}” <span className="text-slate-400">({new Date(c.at).toLocaleDateString()})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}