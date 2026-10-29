/**
 * portal-primitive-fetch.ts — test-only fetch stub for the slice-135 portal
 * pages (forms / tables / dashboards / webhooks).
 *
 * The pages only use `res.status`, `res.ok` and `res.json()`, so a minimal
 * stand-in is enough and keeps the tests free of any network or server.
 * Routes are matched in ORDER — put the most specific URL first.
 */
import { vi } from "vitest";

export interface MockRoute {
  match: (url: string) => boolean;
  status?: number;
  body: unknown;
}

/** `urlHas("/api/native/forms")` — substring matcher. */
export const urlHas = (fragment: string) => (url: string) => url.includes(fragment);

/** `urlIs("/api/native/forms")` — exact pathname matcher (ignores the query). */
export const urlIs = (path: string) => (url: string) => {
  const withoutQuery = url.split("?")[0] ?? "";
  return withoutQuery.endsWith(path);
};

export function mockFetch(routes: MockRoute[]) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const route = routes.find((r) => r.match(url));
    const status = route?.status ?? 404;
    const body = route?.body ?? { error: "not mocked" };
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Every request is rejected as unauthenticated (fail-closed session check). */
export function mockSignedOut() {
  return mockFetch([{ match: () => true, status: 401, body: { error: "Unauthorized" } }]);
}

/**
 * Text matcher for elements whose text is split across nodes by JSX
 * interpolation (e.g. `Forms ({n})` renders "Forms (", "0", ")"). Compares the
 * whitespace-collapsed textContent, so it matches exactly one element.
 */
export function hasText(expected: string) {
  const norm = (s: string) => s.replace(/\s+/g, "");
  return (_content: string, node: Element | null) => !!node && norm(node.textContent ?? "") === norm(expected);
}
