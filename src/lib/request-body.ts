/**
 * lib/request-body.ts — SLICE 174: one bounded body reader for every JSON lane.
 *
 * THE DEFECT THIS CLOSES. Every JSON route read its body with a bare
 * `await req.text()`. That buffers the WHOLE request in memory before a single
 * byte is validated, so an unauthenticated-but-authed-session caller (or a
 * buggy client) could hand the process an arbitrarily large string and watch it
 * be materialised twice (bytes + decoded string). There was no ceiling at all.
 *
 * THE LIMIT — 16 MiB (16_777_216 bytes), and why that number:
 *   • the largest legitimate body we accept is a form submission carrying file
 *     uploads: MAX_TOTAL_UPLOAD_BYTES is 10 MiB of raw bytes, base64-inflated to
 *     ~13.4 MiB plus JSON overhead;
 *   • a 10,000-row import is a few MiB at most (each row is a small object);
 *   • everything else — tables, checklists, deal rooms, proposals, invoices —
 *     is kilobytes.
 * 16 MiB clears the biggest real payload with headroom and is still a bound.
 * Per-lane limits (512 KiB import payload, 10 MiB uploads, 64 KiB row) continue
 * to apply INSIDE this ceiling; this is the last line, not the first.
 *
 * "Before the body is consumed" is literal: a declared Content-Length over the
 * limit is refused without touching the stream, and a chunked body with no
 * declared length is refused the moment the running total crosses the limit —
 * the excess is never buffered, and the reader is cancelled.
 */

/** Hard ceiling on any request body we will read. 16 MiB. */
export const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;

function humanBytes(n: number): string {
  if (n > 0 && n % (1024 * 1024) === 0) return `${n / (1024 * 1024)} MiB`;
  if (n > 0 && n % 1024 === 0) return `${n / 1024} KiB`;
  return `${n} bytes`;
}

/** The 413 body. The number is in the message on purpose — a client that hits
 *  the ceiling must be able to see what the ceiling is. */
export function requestTooLarge(limit: number = MAX_REQUEST_BODY_BYTES): Response {
  return Response.json(
    { error: `Request body exceeds the ${limit}-byte limit (${humanBytes(limit)})` },
    { status: 413 },
  );
}

export type CappedBody = { ok: true; text: string } | { ok: false; response: Response };

/**
 * Read a request body, refusing anything over `limit` bytes with a 413.
 * Never buffers more than `limit` bytes. Reads the body exactly once.
 */
export async function readBodyCapped(req: Request, limit: number = MAX_REQUEST_BODY_BYTES): Promise<CappedBody> {
  // 1. Declared length — refuse before the stream is touched at all.
  const declaredRaw = req.headers.get("content-length");
  if (declaredRaw !== null && declaredRaw.trim() !== "") {
    const declared = Number(declaredRaw);
    if (Number.isFinite(declared) && declared > limit) return { ok: false, response: requestTooLarge(limit) };
  }
  // 2. No usable length (chunked / streamed) — count as we read.
  if (!req.body) return { ok: true, text: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        // Stop pulling: the excess is never buffered. Fail closed.
        try {
          await reader.cancel();
        } catch {
          /* the socket may already be gone — the 413 still stands */
        }
        return { ok: false, response: requestTooLarge(limit) };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(merged) };
}
