/**
 * native/survey/router.ts — HTTP surface for Phase 3.4 native surveys.
 *
 * AUTHED ONLY (/api/native/survey*): survey builder list/create/get/update/
 * publish/archive/delete, responses, feedback aggregation (stats), and the
 * pending-write decision lanes. 404 on any foreign/unknown id (fail-closed);
 * forged create-ids → 400; prod-server wires this AFTER the session check.
 *
 * PUBLIC LANE (/api/native/survey/share/:slug): a published survey's share
 * link. GET → SAFE summary + question set ONLY (no tenant internals: no
 * tenant email, no response ids, no other surveys); POST submit → RATE-LIMITED
 * per slug+client (10/min), answer-validated BEFORE the gate, the response
 * ride the tenant Approval Queue, and the reply carries ONLY {status} (the
 * 3.1 booking share / 2.4 deal-room no-leak contract). Bogus/foreign slug →
 * 404.
 *
 * Explicit-segment parsing only (no two-capture regex) — the 1.4 rowMatch
 * shadowing class is avoided.
 */
import { registerNativeEventType } from "../webhooks/registry";
import { getSurvey, listSurveys, listResponses, lookupPublishedSurvey, listPendingWrites, getPendingWriteById } from "./store";
import { executePendingSurveyWrite, noteOwnerDecision, submitSurveyWrite } from "./gate";
import { MAX_RESPONSES_PER_SURVEY, PUBLIC_SHARE_RATE_LIMIT } from "./types";

export interface NativeSurveyCtx {
  userEmail: string;
  dataDir: string;
}

const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json401 = () => Response.json({ error: "Not authenticated" }, { status: 401 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not published|accepted/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 400 });
}

const SLUG_RE = /^[A-Za-z0-9_-]{4,64}$/;
const ISVY_RE = /^svy_[A-Za-z0-9_-]+$/;

/** Safe public projection — respondent-facing (question SET is the intended
 *  public surface of a published survey; nothing tenant-internal). */
function publicProjection(survey: ReturnType<typeof getSurvey>): Record<string, unknown> {
  return {
    title: survey!.name,
    description: survey!.description,
    kind: survey!.kind,
    questions: survey!.questions.map((q) => ({ id: q.id, label: q.label, kind: q.kind, required: q.required })),
  };
}

/** Rate limit bucket: slug → client → { count, resetAt } */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || b.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > PUBLIC_SHARE_RATE_LIMIT;
}
function clientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  return cf;
}

function statsFor(surveyId: string, ctx: NativeSurveyCtx): Record<string, unknown> {
  const survey = getSurvey(ctx.dataDir, ctx.userEmail, surveyId);
  if (!survey) return {};
  const responses = listResponses(ctx.dataDir, ctx.userEmail, surveyId).filter((r) => r.status === "recorded");
  const n = responses.length;
  let nps: number | null = null;
  let csatAvg: number | null = null;
  const perQuestion: Record<string, { avg: number | null; count: number }> = {};
  const comments: Array<{ at: string; comment: string }> = [];
  for (const r of responses) {
    for (const [qid, val] of Object.entries(r.answers)) {
      if (typeof val === "number") {
        const cur = perQuestion[qid] ?? { avg: 0, count: 0 };
        perQuestion[qid] = { avg: (cur.avg ?? 0) + val, count: cur.count + 1 };
      }
    }
    if (r.comment) comments.push({ at: r.submittedAt, comment: r.comment });
  }
  for (const q of survey.questions) {
    const cur = perQuestion[q.id];
    if (cur && cur.count > 0) perQuestion[q.id] = { avg: Number(((cur.avg ?? 0) / cur.count).toFixed(2)), count: cur.count };
  }
  if (survey.kind === "nps") {
    let promoters = 0;
    let detractors = 0;
    for (const r of responses) {
      for (const val of Object.values(r.answers)) {
        if (typeof val === "number") {
          if (val >= 9) promoters += 1;
          else if (val <= 6) detractors += 1;
        }
      }
    }
    if (n > 0) nps = Math.round(((promoters - detractors) / n) * 100);
  }
  if (survey.kind === "csat") {
    let sum = 0;
    let cnt = 0;
    for (const r of responses) {
      for (const val of Object.values(r.answers)) {
        if (typeof val === "number") {
          sum += val;
          cnt += 1;
        }
      }
    }
    if (cnt > 0) csatAvg = Number((sum / cnt).toFixed(2));
  }
  return {
    total: n,
    pending: listResponses(ctx.dataDir, ctx.userEmail).filter((r) => r.status === "pending" && r.surveyId === surveyId).length,
    cap: MAX_RESPONSES_PER_SURVEY,
    nps,
    csatAvg,
    perQuestion,
    comments,
  };
}

async function handleAuthedAsync(req: Request, ctx: NativeSurveyCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/survey\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  if (!tenantId) return json401();

  // GET /api/native/survey — list + capped stats summary
  if (seg.length === 0 && req.method === "GET") {
    const surveys = listSurveys(ctx.dataDir, tenantId);
    return Response.json({
      data: {
        surveys: surveys.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          kind: s.kind,
          status: s.status,
          slug: s.slug,
          questionCount: s.questions.length,
          responseCount: listResponses(ctx.dataDir, tenantId, s.id).filter((r) => r.status === "recorded").length,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      },
    });
  }
  // POST /api/native/survey — create (gated write)
  if (seg.length === 0 && req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json400("body must be a JSON object");
    const res = submitSurveyWrite(ctx.dataDir, tenantId, "create", { survey: body as Record<string, unknown>, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", surveyId: res.surveyId, autonomy: res.autonomy } }, { status: 201 });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error ?? "create failed");
  }
  // /api/native/survey/:id — get / update / publish / archive / delete
  if (seg.length >= 1 && ISVY_RE.test(seg[0] || "")) {
    const surveyId = seg[0];
    const survey = getSurvey(ctx.dataDir, tenantId, surveyId);
    if (!survey) return json404("Survey not found"); // foreign/stranger → 404 (no IDOR)
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({ data: { survey, stats: statsFor(surveyId, ctx) } });
    }
    if (seg.length === 2) {
      if (req.method === "POST" && seg[1] === "update") {
        const body = await req.json().catch(() => null);
        if (!body || typeof body !== "object") return json400("body must be a JSON object");
        const res = submitSurveyWrite(ctx.dataDir, tenantId, "update", { surveyId, survey: body as Record<string, unknown>, via: "portal" }, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", surveyId: res.surveyId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "update failed");
      }
      if (req.method === "POST" && seg[1] === "publish") {
        const res = submitSurveyWrite(ctx.dataDir, tenantId, "publish", { surveyId, via: "portal" }, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", surveyId: res.surveyId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "publish failed");
      }
      if (req.method === "POST" && seg[1] === "archive") {
        const res = submitSurveyWrite(ctx.dataDir, tenantId, "archive", { surveyId, via: "portal" }, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", surveyId: res.surveyId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "archive failed");
      }
      if (seg[1] === "responses" && req.method === "GET") {
        return Response.json({ data: { responses: listResponses(ctx.dataDir, tenantId, surveyId) } });
      }
      if (seg[1] === "stats" && req.method === "GET") {
        return Response.json({ data: { stats: statsFor(surveyId, ctx) } });
      }
      return json404("Unknown native survey endpoint");
    }
    if (seg.length === 1 && req.method === "DELETE") {
      const res = submitSurveyWrite(ctx.dataDir, tenantId, "delete", { surveyId, via: "portal" }, tenantId);
      return res.applied ? Response.json({ data: { status: "applied" } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "delete failed");
    }
    return json404("Unknown native survey endpoint");
  }
  // /api/native/survey/writes — pending decision lanes
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending") } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && req.method === "POST") {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this survey action");
      if (seg[2] === "apply") {
        const res = executePendingSurveyWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", ptwId: res.ptwId, surveyId: res.surveyId, responseId: res.responseId, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", ptwId: w.id } });
    }
    return json405();
  }
  return json404("Unknown native survey endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeSurveysAuthed(req: Request, ctx: NativeSurveyCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}

/** PUBLIC share handler — wired BEFORE the session check (like 3.1 booking). */
export function handleNativeSurveyShare(req: Request, ctx: { dataDir: string }, _slug: string): Promise<Response> {
  const url = new URL(req.url);
  // EXPLICIT-SEGMENT parsing (no two-capture regex — the 1.4 shadowing class):
  //   /api/native/survey/share/<slug>            → GET view
  //   /api/native/survey/share/<slug>/submit     → POST response (public)
  // The slug is ALWAYS the segment after "share/"; the trailing "submit" is
  // a separate flag — never conflated with the slug.
  const segs = url.pathname.split("/").filter(Boolean);
  const shareIdx = segs.lastIndexOf("share");
  const slug = shareIdx >= 0 && segs[shareIdx + 1] ? segs[shareIdx + 1] : "";
  const isSubmit = segs[segs.length - 1] === "submit";
  if (!slug || !SLUG_RE.test(slug)) return Promise.resolve(json404("Survey not found"));
  if (req.method === "GET" && !isSubmit) {
    const hit = lookupPublishedSurvey(ctx.dataDir, slug);
    if (!hit) return Promise.resolve(json404("Survey not found")); // bogus/foreign → 404 (no enumeration)
    return Promise.resolve(Response.json({ data: publicProjection(hit.survey) }));
  }
  if (req.method === "POST" && isSubmit) {
    if (rateLimited(`${slug}:${clientKey(req)}`)) {
      return Promise.resolve(Response.json({ error: "Too many submissions — try again shortly" }, { status: 429 }));
    }
    const hit = lookupPublishedSurvey(ctx.dataDir, slug);
    if (!hit) return Promise.resolve(json404("Survey not found"));
    return (async () => {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json400("body must be a JSON object");
      const b = body as { answers?: Record<string, unknown>; comment?: string };
      const res = submitSurveyWrite(ctx.dataDir, hit.tenantId, "submit", { surveyId: hit.survey.id, answers: b.answers, comment: b.comment, via: "share" }, "public:anon");
      if (res.applied) return Response.json({ data: { status: "recorded" } });
      if (res.pending) return Response.json({ data: { status: "pending" } }, { status: 202 });
      return gateErrorStatus(res.error ?? "submission failed");
    })();
  }
  return Promise.resolve(json405());
}

// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–3.3) ─────────────
export function registerBuiltinNativeSurveyEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.survey.created",
    "native.survey.updated",
    "native.survey.published",
    "native.survey.archived",
    "native.survey.deleted",
    "native.survey.pending",
    "native.survey.response.queued",
    "native.survey.response.recorded",
    "native.survey.response.rejected",
  ]) {
    registerNativeEventType(t, base);
  }
}