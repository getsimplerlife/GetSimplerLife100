/**
 * SLICE 181 — the survey RESPONDENT page.
 *
 * THE DEFECT THIS PINS. `/portal/surveys` told the tenant to send their client
 * `…/api/native/survey/share/<slug>` — the JSON endpoint. The client opened it
 * and got `{"data":{…}}`: no form, no way to answer. The server lane was
 * finished and public all along; only the page was missing.
 *
 * HOW THE ASSERTIONS AVOID BLESSING THE BUG (slice 171's lesson):
 *  - the share path is never asserted as a string the page also writes — it is
 *    checked against `routePaths()` (the router's own `FileRoutesByFullPath`),
 *    and the link the PORTAL page actually renders is read out of the DOM and
 *    checked the same way;
 *  - the submit URL is checked as `GET url + "/submit"` — the server's own
 *    documented pairing — not as a second hardcoded literal;
 *  - the answer payload is compared against the values the test itself typed;
 *  - the "pending" copy is compared against the "recorded" copy the same page
 *    rendered a moment earlier, not against a string written here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { matchesRoute, routePaths } from "./helpers/route-tree";
import { surveySharePath } from "~/lib/share-links";
import SurveyRespondentPage from "~/lazy/surveys.share.$slug.page";

/** The public projection the server sends (src/native/survey/router.ts:47-55). */
const PROJECTION = {
  title: "Q4 client check-in",
  description: "Three quick questions about the last quarter.",
  kind: "nps",
  questions: [
    { id: "q_nps", label: "How likely are you to recommend us?", kind: "nps", required: true },
    { id: "q_rate", label: "How was the delivery?", kind: "rating", required: true },
    { id: "q_text", label: "What should we improve?", kind: "text", required: false },
  ],
};

const SLUG = "abcd1234";

type Reply = { status?: number; body: unknown };
type Call = { url: string; method: string; body: string | undefined };

let calls: Call[] = [];

/** Minimal Response stand-in — jsdom's fetch/Response are not what we test. */
function reply({ status = 200, body }: Reply) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * Mock `fetch`. `submit` decides the POST answer; the GET always serves
 * `projection` unless `view` says otherwise.
 */
function mockFetch(opts: {
  projection?: unknown;
  view?: Reply;
  submit?: Reply;
} = {}) {
  calls = [];
  const projection = "projection" in opts ? opts.projection : PROJECTION;
  const view: Reply = opts.view ?? { status: 200, body: { data: projection } };
  const submit: Reply = opts.submit ?? { status: 200, body: { data: { status: "recorded" } } };
  globalThis.fetch = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: init?.body });
    return method === "POST" ? reply(submit) : reply(view);
  }) as unknown as typeof fetch;
}

async function renderRespondent(slug = SLUG) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/surveys/share/$slug",
    component: SurveyRespondentPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: [surveySharePath(slug)] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

/** Answer the three fixture questions and send. */
async function answerAndSend() {
  await waitFor(() => expect(screen.getByRole("heading")).toBeTruthy());
  const nps = screen.getByRole("group", { name: PROJECTION.questions[0].label });
  const rating = screen.getByRole("group", { name: PROJECTION.questions[1].label });
  fireEvent.click(within(nps).getByRole("radio", { name: "9" }));
  fireEvent.click(within(rating).getByRole("radio", { name: "4" }));
  fireEvent.change(screen.getByLabelText(/What should we improve/), { target: { value: "Faster kickoff" } });
  fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: "Thanks" } });
  fireEvent.click(screen.getByRole("button", { name: /send my response/i }));
}

afterEach(() => {
  cleanup();
  calls = [];
  vi.restoreAllMocks();
});

describe("SLICE 181 — the respondent page renders the public projection", () => {
  it("shows the title, the description and one control per question, by kind", async () => {
    mockFetch();
    await renderRespondent();

    await waitFor(() => expect(screen.getByRole("heading", { name: PROJECTION.title })).toBeTruthy());
    expect(screen.getByText(PROJECTION.description)).toBeTruthy();

    // nps = 0..10 and rating = 1..5 are the SERVER's scales
    // (src/native/survey/gate.ts validateAnswers: nps 0..10, rating 0..5).
    const nps = screen.getByRole("group", { name: PROJECTION.questions[0].label });
    expect(within(nps).getAllByRole("radio")).toHaveLength(11);
    const rating = screen.getByRole("group", { name: PROJECTION.questions[1].label });
    expect(within(rating).getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByLabelText(/What should we improve/)).toBeTruthy();

    // It asked the server for the public projection — the lane that exists.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.startsWith("/api/native/survey/share/")).toBe(true);
  });

  it("never leaks a token or a tenant id into the page", async () => {
    mockFetch();
    await renderRespondent();
    await waitFor(() => expect(screen.getByRole("heading", { name: PROJECTION.title })).toBeTruthy());
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/tenantId|tenant_id|Bearer|api[_-]?key/i);
  });
});

describe("SLICE 181 — submitting", () => {
  it("posts { answers, comment } to the server's own …/submit path", async () => {
    mockFetch();
    await renderRespondent();
    await answerAndSend();

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const get = calls.find((c) => c.method === "GET");
    const post = calls.find((c) => c.method === "POST");
    // The server pairs the two: GET …/<slug> and POST …/<slug>/submit.
    expect(post!.url).toBe(`${get!.url}/submit`);
    expect(JSON.parse(post!.body as string)).toEqual({
      answers: { q_nps: 9, q_rate: 4, q_text: "Faster kickoff" },
      comment: "Thanks",
    });
  });

  it("enforces required questions in the UI before the server is asked", async () => {
    mockFetch();
    await renderRespondent();
    await waitFor(() => expect(screen.getByRole("button", { name: /send my response/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /send my response/i }));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("says RECORDED only for recorded, and PENDING never claims it was recorded", async () => {
    // 1) the recorded lane
    mockFetch({ submit: { status: 200, body: { data: { status: "recorded" } } } });
    await renderRespondent();
    await answerAndSend();
    await waitFor(() => expect(screen.queryByRole("button", { name: /send my response/i })).toBeNull());
    const recordedText = document.body.textContent ?? "";
    expect(recordedText).toMatch(/recorded/i);
    cleanup();

    // 2) the approval-gated lane — 202 { data: { status: "pending" } }
    mockFetch({ submit: { status: 202, body: { data: { status: "pending" } } } });
    await renderRespondent();
    await answerAndSend();
    await waitFor(() => expect(screen.queryByRole("button", { name: /send my response/i })).toBeNull());
    const pendingText = document.body.textContent ?? "";

    expect(pendingText).not.toBe(recordedText);
    // The recorded page's own words must not appear on the pending page.
    expect(pendingText.includes(recordedText.trim())).toBe(false);
    // It must say what actually happened: received, waiting for approval.
    expect(pendingText).toMatch(/received/i);
    expect(pendingText).toMatch(/approv/i);
  });

  it("prints the server's own message on a 400, not a generic apology", async () => {
    const serverError = "required question not answered: q_nps";
    mockFetch({ submit: { status: 400, body: { error: serverError } } });
    await renderRespondent();
    await answerAndSend();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain(serverError);
    // Still on the form — nothing claimed to be saved.
    expect(screen.getByRole("button", { name: /send my response/i })).toBeTruthy();
  });

  it("prints the server's rate-limit message on a 429", async () => {
    const serverError = "Too many submissions — try again shortly";
    mockFetch({ submit: { status: 429, body: { error: serverError } } });
    await renderRespondent();
    await answerAndSend();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain(serverError);
  });
});

describe("SLICE 181 — failure states are not empty forms", () => {
  it("renders a not-available page for a 404 slug, with no form at all", async () => {
    mockFetch({ view: { status: 404, body: { error: "Survey not found" } } });
    await renderRespondent("zzzz9999");
    await waitFor(() => expect(screen.queryByText(/loading survey/i)).toBeNull());
    expect(screen.queryByRole("button", { name: /send my response/i })).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(document.body.textContent ?? "").toMatch(/not available|isn't available/i);
  });

  it("renders an error (never an empty survey) when the server fails", async () => {
    mockFetch({ view: { status: 500, body: { error: "Internal error" } } });
    await renderRespondent();
    await waitFor(() => expect(screen.queryByText(/loading survey/i)).toBeNull());
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /send my response/i })).toBeNull();
    expect(document.body.textContent ?? "").toContain("Internal error");
  });

  it("renders an error when the network itself fails", async () => {
    calls = [];
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await renderRespondent();
    await waitFor(() => expect(screen.queryByText(/loading survey/i)).toBeNull());
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(document.body.textContent ?? "").toMatch(/could not reach the server/i);
  });

  it("an unknown question kind is shown, not crashed on, and blocks the submission", async () => {
    mockFetch({
      projection: {
        ...PROJECTION,
        questions: [
          { id: "q_nps", label: "How likely are you to recommend us?", kind: "nps", required: true },
          { id: "q_matrix", label: "Rank these priorities", kind: "matrix", required: true },
        ],
      },
    });
    await renderRespondent();
    await waitFor(() => expect(screen.getByText("Rank these priorities")).toBeTruthy());
    // The unsupported question is visible and named as unanswerable...
    expect(document.body.textContent ?? "").toMatch(/can't display|can’t display/i);
    // ...and the page refuses to submit a partial response while claiming success.
    const send = screen.getByRole("button", { name: /send my response/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});

describe("SLICE 181 — the surveys share route really exists", () => {
  it("is in the router's FileRoutesByFullPath as a $slug route under /surveys/share", () => {
    const routes = routePaths();
    // Guard against a vacuous pass: the tree must actually have been read.
    expect(routes.size).toBeGreaterThan(50);

    const shareRoutes = [...routes].filter((r) => {
      const segs = r.replace(/\/$/, "").split("/");
      return segs.length === 4 && segs[1] === "surveys" && segs[2] === "share";
    });
    expect(shareRoutes).toHaveLength(1);
    expect(shareRoutes[0].split("/")[3].startsWith("$")).toBe(true);

    // The URL the portal hands out resolves to it.
    expect(matchesRoute(surveySharePath(SLUG), routes)).toBe(true);
    // The URL it used to hand out does not — it was the JSON endpoint.
    expect(matchesRoute(`/api/native/survey/share/${SLUG}`, routes)).toBe(false);
  });
});

describe("SLICE 181 — the link /portal/surveys builds points at the respondent page", () => {
  it("renders a share link that resolves in the route tree", async () => {
    const summary = {
      id: "svy_1",
      name: PROJECTION.title,
      description: PROJECTION.description,
      kind: "nps",
      status: "published",
      slug: SLUG,
      questionCount: PROJECTION.questions.length,
      responseCount: 0,
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    const stats = { total: 0, pending: 0, nps: null, csatAvg: null, perQuestion: {}, comments: [] };
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      const body = url === "/api/native/survey"
        ? { data: { surveys: [summary] } }
        : url === "/api/native/survey/writes"
          ? { data: { writes: [] } }
          : { data: { survey: { ...summary, questions: PROJECTION.questions }, stats } };
      return reply({ status: 200, body });
    }) as unknown as typeof fetch;

    const SurveysPage = (await import("~/lazy/portal.surveys.index.page")).default;
    render(<SurveysPage />);

    const open = await screen.findByRole("button", { name: "Open" });
    fireEvent.click(open);

    const input = (await screen.findByDisplayValue(new RegExp(`/surveys/share/|/api/native/survey/share/`))) as HTMLInputElement;
    const path = new URL(input.value, window.location.origin).pathname;

    // Derive the expectation from the route tree, not from the page's own string.
    expect(matchesRoute(path, routePaths())).toBe(true);
    expect(path.startsWith("/api/")).toBe(false);
    expect(path).toBe(surveySharePath(SLUG));
  });
});
