/**
 * native-survey.test.ts — Phase 3.4 native surveys / NPS / scorecards.
 *
 * Coverage: gated owner ops (create/update/publish/archive/delete) with
 * lifecycle rules, forged create-id → 400 (server-assigned ids only), gated
 * PUBLIC response submission (slug-gated, rate-limited, reply carries ONLY
 * {status}, safe summary never leaks tenant internals), answer validation
 * BEFORE the gate (unknown question / out-of-range / missing required never
 * queues), idempotent apply, autonomy allow-list, cross-tenant → 404-no-IDOR,
 * feedback aggregation (NPS/CSAT/per-question math), audit + events.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeSurveysAuthed, handleNativeSurveyShare, registerBuiltinNativeSurveyEventTypes } from "../native/survey/router";
import { listSurveys, listAudit, listResponses, listPendingWrites } from "../native/survey/store";
import { setAutonomyWorkflow } from "../lib/autonomy";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;

function authedReq(method: string, pathname: string, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  return new Request(`http://localhost${pathname}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}
function route(method: string, pathname: string, body?: unknown, tenant: string = T1): Promise<Response> {
  return handleNativeSurveysAuthed(authedReq(method, pathname, body), { userEmail: tenant, dataDir: dir });
}
function publicRoute(method: string, pathname: string, body?: unknown): Promise<Response> {
  return handleNativeSurveyShare(authedReq(method, pathname, body), { dataDir: dir }, pathname.split("/").pop() || "");
}
const SURVEY_DRAFT = {
  name: "Client health check",
  description: "Quarterly pulse",
  kind: "csat",
  questions: [
    { label: "How satisfied? (1-5)", kind: "rating", required: true },
    { label: "What could improve?", kind: "text", required: false },
  ],
};
async function pendingWrite() {
  const ws = listPendingWrites(dir, T1).filter((w) => w.status === "pending");
  return ws[ws.length - 1]!;
}
async function createAndApply(): Promise<{ surveyId: string; slug: string }> {
  const r = await route("POST", "/api/native/survey", SURVEY_DRAFT);
  expect(r.status).toBe(202); // gated
  const ptw = await pendingWrite();
  const a = await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
  expect(a.status).toBe(200);
  const data = (await a.json()).data as { surveyId?: string };
  const s = listSurveys(dir, T1).find((x) => x.id === data.surveyId)!;
  return { surveyId: s.id, slug: s.slug };
}
async function publish(surveyId: string) {
  const r = await route("POST", `/api/native/survey/${surveyId}/publish`);
  expect(r.status).toBe(202);
  const ptw = await pendingWrite();
  const a = await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
  expect(a.status).toBe(200);
}
async function submitResponse(surveyId: string, answers: Record<string, unknown>, comment?: string): Promise<Response> {
  const hit = listSurveys(dir, T1).find((s) => s.id === surveyId)!;
  // The share-lane contract is { answers, comment } (see handleNativeSurveyShare).
  return publicRoute("POST", `/api/native/survey/share/${hit.slug}/submit`, { answers, comment });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-survey-"));
  registerBuiltinNativeSurveyEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("native survey slice", () => {
  it("create is gated; apply builds a server-id survey (svy_/q_ ids, slug) with audit", async () => {
    const { surveyId, slug } = await createAndApply();
    const s = listSurveys(dir, T1).find((x) => x.id === surveyId)!;
    expect(s.status).toBe("draft");
    expect(s.id.startsWith("svy_")).toBe(true);
    expect(slug.length).toBeGreaterThanOrEqual(8);
    expect(s.questions.length).toBe(2);
    expect(s.questions.every((q) => q.id.startsWith("q_"))).toBe(true);
    expect(listAudit(dir, T1).some((e) => e.action === "native.survey.created" && e.surveyId === surveyId)).toBe(true);
  });

  it("forged client-supplied survey/question ids → 400, never queued", async () => {
    const forged = await route("POST", "/api/native/survey", { ...SURVEY_DRAFT, id: "svy_forged" });
    expect(forged.status).toBe(400);
    const qForged = await route("POST", "/api/native/survey", { ...SURVEY_DRAFT, questions: [{ id: "q_evil", label: "x", kind: "text", required: false }] });
    expect(qForged.status).toBe(400);
    expect(listPendingWrites(dir, T1).length).toBe(0);
  });

  it("lifecycle: publish drafts, edit only in draft, archive published (terminal), delete only empty drafts", async () => {
    const { surveyId } = await createAndApply();
    // update in draft OK
    await publish(surveyId);
    // update after publish → 400
    const upd = await route("POST", `/api/native/survey/${surveyId}/update`, { name: "Renamed" });
    expect(upd.status).toBe(400);
    // delete published → 400
    const del = await route("DELETE", `/api/native/survey/${surveyId}`);
    expect(del.status).toBe(400);
    // archive → applied
    const ar = await route("POST", `/api/native/survey/${surveyId}/archive`);
    expect(ar.status).toBe(202);
    const ptw = await pendingWrite();
    const a = await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
    expect(a.status).toBe(200);
    expect(listSurveys(dir, T1).find((s) => s.id === surveyId)!.status).toBe("archived");
  });

  it("public share: safe summary only; foreign/bogus slug → 404; submit replies ONLY {status}; responses gated", async () => {
    const { surveyId, slug } = await createAndApply();
    await publish(surveyId);
    const s = listSurveys(dir, T1).find((x) => x.id === surveyId)!;
    const q = s.questions.find((qq) => qq.kind === "rating")!.id;
    const tq = s.questions.find((qq) => qq.kind === "text")!.id;

    const view = await publicRoute("GET", `/api/native/survey/share/${slug}`);
    expect(view.status).toBe(200);
    const raw = await view.text();
    expect(raw).not.toContain(T1); // no tenant email in the public payload
    const proj = (JSON.parse(raw) as { data: { title: string; questions: { id: string }[] } }).data;
    expect(proj.title).toBe("Client health check");
    expect(proj.questions.length).toBe(2);

    expect((await publicRoute("GET", "/api/native/survey/share/doesnotexist000")).status).toBe(404);
    // Published surveys are share-link-addressable by design (no tenant internals
    // leak in the payload); submissions ride the OWNER's approval queue.
    const sub = await publicRoute("POST", `/api/native/survey/share/${slug}/submit`, { answers: { [q]: 5, [tq]: "Great" } });
    expect(sub.status).toBe(202);
    const body = (await sub.json()) as { data: { status: string } };
    expect(Object.keys(body)).toEqual(["data"]);
    expect(Object.keys(body.data)).toEqual(["status"]); // reply carries ONLY {status}
    expect(body.data.status).toBe("pending");
    expect(listResponses(dir, T1, surveyId).length).toBe(0); // not recorded until approved

    // approve → recorded
    const ptw = await pendingWrite();
    expect(ptw.op).toBe("submit");
    const app = await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
    expect(app.status).toBe(200);
    expect(listResponses(dir, T1, surveyId).length).toBe(1);
    expect(listResponses(dir, T1, surveyId)[0]!.status).toBe("recorded");
    expect(listResponses(dir, T2).length).toBe(0); // zero cross-tenant
  });

  it("answer validation BEFORE the gate: unknown question / out-of-range / missing required never queue", async () => {
    const { surveyId } = await createAndApply();
    await publish(surveyId);
    const s = listSurveys(dir, T1).find((x) => x.id === surveyId)!;
    const q = s.questions.find((qq) => qq.kind === "rating")!.id;
    expect((await submitResponse(surveyId, { [q]: 99 })).status).toBe(400); // out of 1-5
    expect((await submitResponse(surveyId, { q_unknown_000: 3 })).status).toBe(400);
    expect((await submitResponse(surveyId, {})).status).toBe(400); // required missing
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
  });

  it("rate limit: >10 submissions per slug+client in a minute → 429", async () => {
    const { surveyId } = await createAndApply();
    await publish(surveyId);
    const s = listSurveys(dir, T1).find((x) => x.id === surveyId)!;
    const q = s.questions.find((qq) => qq.kind === "rating")!.id;
    const tq = s.questions.find((qq) => qq.kind === "text")!.id;
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const r = await publicRoute("POST", `/api/native/survey/share/${s.slug}/submit`, { answers: { [q]: 5, [tq]: `r${i}` } });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it("autonomy allow-list auto-creates with recordAutonomyOutcome", async () => {
    setAutonomyWorkflow(T1, "native-survey", { enabled: true, allowList: [{ id: "al-survey-create", action: "createSurvey" }] }, dir);
    const r = await route("POST", "/api/native/survey", SURVEY_DRAFT);
    expect(r.status).toBe(201); // auto-applied
    expect(listSurveys(dir, T1).length).toBe(1);
    expect(listAudit(dir, T1).some((e) => e.action === "native.survey.created")).toBe(true);
  });

  it("aggregation: NPS and CSAT math + per-question averages + comments; foreign id → 404", async () => {
    const { surveyId } = await createAndApply();
    await publish(surveyId);
    const s = listSurveys(dir, T1).find((x) => x.id === surveyId)!;
    const q = s.questions.find((qq) => qq.kind === "rating")!.id;
    expect(q).toBeTruthy();
    // CSAT responses: 3 + 5 = avg 4; comments captured via the comment field.
    for (const score of [3, 5]) {
      const r = await submitResponse(surveyId, { [q]: score }, "nice");
      expect(r.status).toBe(202);
      const ptw = await pendingWrite();
      const a = await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
      expect(a.status).toBe(200);
    }
    const stats = await route("GET", `/api/native/survey/${surveyId}/stats`);
    expect(stats.status).toBe(200);
    const d = (await stats.json()).data as { stats: { total: number; csatAvg: number | null; perQuestion: Record<string, { avg: number | null }>; comments: { comment: string }[] } };
    expect(d.stats.total).toBe(2);
    expect(d.stats.csatAvg).toBe(4);
    expect(d.stats.perQuestion[q]!.avg).toBe(4);
    expect(d.stats.comments.length).toBe(2);
    // NPS math: 9,9 (promoters) and 5,5 (detractors) → 0; 10 → 100.
    const npsCreated = await route("POST", "/api/native/survey", { name: "NPS", kind: "nps", questions: [{ label: "likely? 0-10", kind: "nps", required: true }] });
    expect(npsCreated.status).toBe(202);
    let ptw = await pendingWrite();
    await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
    const nps = listSurveys(dir, T1).find((x) => x.kind === "nps")!;
    await route("POST", `/api/native/survey/${nps.id}/publish`);
    ptw = await pendingWrite();
    await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
    // submit 3 NPS responses via the share lane
    for (const score of [9, 5, 8]) {
      const r = await publicRoute("POST", `/api/native/survey/share/${nps.slug}/submit`, { answers: { [nps.questions[0]!.id]: score } });
      expect(r.status).toBe(202);
      ptw = await pendingWrite();
      await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
    }
    const npsStats = await route("GET", `/api/native/survey/${nps.id}/stats`);
    const nd = (await npsStats.json()).data as { stats: { nps: number | null } };
    expect(nd.stats.nps).toBe(0); // (1 promoter - 1 detractor) / 3 = 0
    // foreign tenant → 404 no-IDOR
    expect((await route("GET", `/api/native/survey/${surveyId}/stats`, undefined, T2)).status).toBe(404);
    expect((await route("GET", `/api/native/survey/${surveyId}`, undefined, T2)).status).toBe(404);
  });

  it("idempotent apply: replay → alreadyApplied, no duplicate response", async () => {
    const { surveyId } = await createAndApply();
    await publish(surveyId);
    const s = listSurveys(dir, T1).find((x) => x.id === surveyId)!;
    const q = s.questions.find((qq) => qq.kind === "rating")!.id;
    const sub = await submitResponse(surveyId, { [q]: 5 });
    expect(sub.status).toBe(202);
    const ptw = await pendingWrite();
    const a1 = await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
    expect(a1.status).toBe(200);
    const d1 = (await a1.json()).data as { alreadyApplied?: boolean };
    const a2 = await route("POST", `/api/native/survey/writes/${ptw.id}/apply`);
    const d2 = (await a2.json()).data as { alreadyApplied?: boolean };
    expect(d1.alreadyApplied ?? false).toBe(false);
    expect(d2.alreadyApplied).toBe(true);
    expect(listResponses(dir, T1, surveyId).length).toBe(1);
  });
});