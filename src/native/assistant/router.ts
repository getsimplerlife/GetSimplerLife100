/**
 * native/assistant/router.ts — Phase 3.8 native ASSISTANT HTTP surface.
 * Authed tenant-scoped routes (401 fail-closed upstream, no public share):
 *
 *   POST /api/native/assistant/ask                  GATED ask (verb-first
 *                                                   `assistantAsk`); reply
 *                                                   carries the labeled draft
 *   GET  /api/native/assistant/messages             transcript (tenant-scoped)
 *   GET  /api/native/assistant/writes               pending write mirror
 *   POST /api/native/assistant/writes/:apwId/apply  APPROVE-path executor
 *                                                   (idempotent)
 *   POST /api/native/assistant/writes/:apwId/reject REJECT-path (discards)
 *   GET  /api/native/assistant/audit                immutable native.assistant.*
 *
 * Every mutation flows through src/native/assistant/gate.ts — invalid prompts,
 * forged ids or cap breaches are rejected BEFORE the gate (never queued);
 * approved asks persist the transcript + draft through the idempotent
 * executor. Tenant isolation: every read/write is `{ [tenantId]: ... }` keyed
 * — a foreign/unknown id → 404 (fail-closed).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  executePendingAssistantWrite,
  rejectAssistantWrite,
  submitAssistantAsk,
} from "./gate";
import {
  listAudit,
  listMessages,
  listPendingWrites,
  appendAudit,
} from "./store";

export interface NativeAssistantCtx {
  userEmail: string;
  dataDir: string;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Body must be a JSON object");
  return parsed as Record<string, unknown>;
}
const isApwId = (v: unknown): v is string => typeof v === "string" && /^apw_[A-Za-z0-9_-]+$/.test(v);

export async function handleNativeAssistantAuthed(req: Request, ctx: NativeAssistantCtx): Promise<Response> {
  const { userEmail, dataDir } = ctx;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/assistant\/?/, "");
  const method = req.method.toUpperCase();

  try {
    if (path === "ask" && method === "POST") {
      const body = parseJsonObject(await req.text());
      const out = await submitAssistantAsk(dataDir, userEmail, userEmail, body.prompt);
      if (out.applied) {
        return Response.json({
          applied: true,
          autonomy: out.autonomy,
          draft: out.draft,
        });
      }
      if (out.pending) {
        return Response.json({
          applied: false,
          pending: true,
          approvalActionId: out.approvalActionId,
          draft: out.draft,
        });
      }
      return Response.json({ error: out.error ?? "ask blocked" }, { status: 500 });
    }

    if (path === "messages" && method === "GET") {
      return Response.json({ messages: listMessages(dataDir, userEmail) });
    }

    if (path === "writes" && method === "GET") {
      return Response.json({ writes: listPendingWrites(dataDir, userEmail) });
    }

    if (path === "audit" && method === "GET") {
      return Response.json({ audit: listAudit(dataDir, userEmail) });
    }

    const applyMatch = path.match(/^writes\/([A-Za-z0-9_-]+)\/apply$/);
    if (applyMatch && method === "POST") {
      const apwId = applyMatch[1];
      if (!isApwId(apwId)) return Response.json({ error: "invalid pending write id" }, { status: 400 });
      const res = await executePendingAssistantWrite(dataDir, userEmail, apwId, userEmail);
      if (!res.ok) return Response.json({ error: res.reason }, { status: 404 });
      return Response.json({ applied: true, already: !!res.already });
    }

    const rejectMatch = path.match(/^writes\/([A-Za-z0-9_-]+)\/reject$/);
    if (rejectMatch && method === "POST") {
      const apwId = rejectMatch[1];
      if (!isApwId(apwId)) return Response.json({ error: "invalid pending write id" }, { status: 400 });
      const res = await rejectAssistantWrite(dataDir, userEmail, apwId, userEmail);
      if (!res.ok) return Response.json({ error: res.reason }, { status: 404 });
      return Response.json({ rejected: true, already: !!res.already });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e: any) {
    const msg = e?.message || String(e);
    // Validation failures (bad body / caps / forged ids) are client errors.
    if (/required|invalid|cap|exceeds|must be|reached|no .* found/i.test(msg)) {
      return Response.json({ error: msg }, { status: 400 });
    }
    appendAudit(dataDir, userEmail, "system", "native.assistant.error", msg);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const EVENT_TYPES = ["native.assistant.ask.requested", "native.assistant.ask.pending", "native.assistant.ask.applied", "native.assistant.ask.rejected"] as const;

/** Phase 1.1 typed-event registration (mirrors every other native slice). */
export function registerBuiltinNativeAssistantEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of EVENT_TYPES) {
    registerNativeEventType(t, base);
  }
}