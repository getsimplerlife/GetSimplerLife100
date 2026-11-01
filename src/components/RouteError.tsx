import { useEffect } from "react";

/**
 * SLICE 167 (D-8) — THE BOUNDARY MUST REPORT ITS CAUSE.
 *
 * /portal/transforms was dead for every user (owner included) for as long as it
 * has existed: the page read `t.transforms` off a `{ data: … }` envelope, got
 * `undefined`, and threw while rendering. The root boundary caught it and
 * reported NOTHING usable — no console entry, no message when the thrown value
 * was not an `Error` — so a whole audit passed over a page that never worked.
 *
 * Now it always reports: the path, the message, the stack, and the component
 * stack go to `window.__errors` (created if absent) and to the console, and the
 * screen says so plainly instead of showing a blank panel.
 */
function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object") {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m) return { message: m };
    try {
      return { message: JSON.stringify(error) };
    } catch {
      return { message: "A non-Error value was thrown and could not be serialized." };
    }
  }
  if (error === undefined || error === null) return { message: "The page threw a null/undefined value." };
  return { message: String(error) };
}

export function RouteError({ error, info }: { error: unknown; info?: { componentStack: string } }) {
  const { message, stack } = describeError(error);
  const path = typeof window !== "undefined" ? window.location?.pathname ?? "" : "";
  // Log to window.__errors so the debugger in index.html captures it — created
  // if the debugger is not there, so nothing can be swallowed.
  if (typeof window !== "undefined") {
    const w = window as any;
    w.__errors = w.__errors || [];
    w.__errors.push(`ROUTE ERROR${path ? ` at ${path}` : ""}: ${message}\n${stack ?? ""}`);
  }
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(`[route error]${path ? ` ${path}` : ""}: ${message}`, error, info?.componentStack ?? "");
  }, [message, path, error, info?.componentStack]);
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: "2rem", fontFamily: "monospace", color: "#d4d4d4", background: "#0a0a0a"
    }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 900, marginBottom: "1rem", color: "#ef4444" }}>
        Something went wrong
      </h1>
      <pre style={{
        maxWidth: "700px", padding: "1rem", background: "#1a1a1a", borderRadius: "0.5rem",
        fontSize: "0.75rem", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
        border: "1px solid #333", color: "#f87171"
      }}>
        {message}
        {path ? `\n\n(at ${path})` : ""}
      </pre>
      <p style={{ maxWidth: "700px", fontSize: "0.7rem", color: "#888", textAlign: "center" }}>
        This page failed to render. The message above is the cause it reported — nothing is hidden from you.
      </p>
      {info && (
        <details style={{ marginTop: "1rem", maxWidth: "700px", width: "100%" }}>
          <summary style={{ cursor: "pointer", color: "#888", fontSize: "0.75rem" }}>Component Stack</summary>
          <pre style={{
            padding: "0.5rem", background: "#1a1a1a", borderRadius: "0.25rem",
            fontSize: "0.65rem", overflow: "auto", whiteSpace: "pre-wrap", color: "#888", marginTop: "0.5rem"
          }}>
            {info.componentStack}
          </pre>
        </details>
      )}
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "1.5rem", padding: "0.5rem 1.5rem", background: "#333", color: "#fff",
          border: "1px solid #555", borderRadius: "0.5rem", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem"
        }}
      >
        Reload Page
      </button>
    </div>
  );
}
