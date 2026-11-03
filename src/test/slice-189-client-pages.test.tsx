/**
 * slice-189-client-pages.test.tsx — the render-time half of the client +
 * project spine.
 *
 * The source guard (`portal-read-failure-guard.test.ts`) scans these pages and
 * can only ask a cheap question: does the file know a read can fail at all? It
 * cannot evaluate the ternary that decides whether the empty state prints. These
 * tests drive a real 500 through each page's own fetch path and assert TWO
 * things:
 *
 *   1. the failure is stated in words the tenant can act on, and
 *   2. the affirmative empty state ("No clients yet" / "No projects yet") is
 *      ABSENT — because an empty workspace and an unreadable store are not the
 *      same claim, and this slice exists to stop the product conflating them.
 *
 * Every page also gets a POSITIVE CONTROL: with a real empty payload the empty
 * state must still render, so the gate is not a blanket removal of honest empty
 * states.
 *
 * The pages are rendered inside a REAL memory router (the pages use <Link> and
 * the detail pages read their id from `useParams`), the same way slice 167
 * rendered the proposal detail page. URLs in the assertions are derived from the
 * route tree via `matchesRoute`, never from a string the page hands back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { existsSync, readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import ClientsPage from "../lazy/portal.clients.index.page";
import ClientDetailPage from "../lazy/portal.clients.$clientId.page";
import ProjectsPage from "../lazy/portal.projects.index.page";
import ProjectDetailPage from "../lazy/portal.projects.$projectId.page";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";
import { matchesRoute, routePaths } from "./helpers/route-tree";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CLIENT = {
  id: "client-abc-123",
  name: "Acme Testing Ltd",
  contactName: "Dana Reed",
  email: "dana@acme.test",
  phone: "+1 555 0100",
  status: "active",
  createdAt: "2026-11-03T10:00:00.000Z",
  updatedAt: "2026-11-03T10:00:00.000Z",
};

const PROJECT = {
  id: "project-xyz-789",
  clientId: CLIENT.id,
  name: "Q4 onboarding rollout",
  status: "active",
  createdAt: "2026-11-03T11:00:00.000Z",
  updatedAt: "2026-11-03T11:00:00.000Z",
};

const fail = (path: string, status = 500) => ({ match: urlIs(path), status, body: { error: "boom" } });

type PageDef = { path: string; component: ComponentType };

/** Every route the four pages can navigate to, stubbed. */
const STUBS: PageDef[] = [
  { path: "/portal/clients", component: () => <div>clients stub</div> },
  { path: "/portal/clients/$clientId", component: () => <div>client stub</div> },
  { path: "/portal/projects", component: () => <div>projects stub</div> },
  { path: "/portal/projects/$projectId", component: () => <div>project stub</div> },
];

/** Render one real page at a real URL, with the other three routes stubbed. */
function renderAt(initialPath: string, overrides: PageDef[]) {
  const merged = new Map<string, ComponentType>();
  for (const def of STUBS) merged.set(def.path, def.component);
  for (const def of overrides) merged.set(def.path, def.component);
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const children = [...merged.entries()].map(([path, component]) =>
    createRoute({ getParentRoute: () => rootRoute, path, component }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(children),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const renderClients = () => renderAt("/portal/clients", [{ path: "/portal/clients", component: ClientsPage }]);
const renderProjects = () => renderAt("/portal/projects", [{ path: "/portal/projects", component: ProjectsPage }]);
const renderClientDetail = () =>
  renderAt(`/portal/clients/${CLIENT.id}`, [{ path: "/portal/clients/$clientId", component: ClientDetailPage }]);
const renderProjectDetail = () =>
  renderAt(`/portal/projects/${PROJECT.id}`, [{ path: "/portal/projects/$projectId", component: ProjectDetailPage }]);

describe("clients — an unreadable client store is not an empty one", () => {
  it("a 500 states the failure and suppresses 'No clients yet'", async () => {
    mockFetch([fail("/api/data/clients")]);
    renderClients();
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    expect(screen.queryByText(/No clients yet/i)).toBeNull();
    // The page must say WHY the list is empty, not just colour the header red.
    expect(screen.getByText(/not because you have no clients/i)).toBeTruthy();
  });

  it("control: a real empty workspace still says 'No clients yet'", async () => {
    mockFetch([{ match: urlIs("/api/data/clients"), body: { data: [] } }]);
    renderClients();
    await waitFor(() => expect(screen.getByText(/No clients yet/i)).toBeTruthy());
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });

  it("renders a stored client and links to its detail route", async () => {
    mockFetch([{ match: urlIs("/api/data/clients"), body: { data: [CLIENT] } }]);
    renderClients();
    const link = await screen.findByRole("link", { name: "Acme Testing Ltd" });
    // Derived from the route tree, never from the string the page hands back.
    expect(matchesRoute("/portal/clients/$clientId", routePaths())).toBe(true);
    expect(link.getAttribute("href")).toBe(`/portal/clients/${CLIENT.id}`);
  });

  it("posts the form fields and re-reads the list instead of trusting the echo", async () => {
    const fetchMock = mockFetch([{ match: urlIs("/api/data/clients"), body: { data: [] } }]);
    renderClients();
    await waitFor(() => expect(screen.getByText(/No clients yet/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Customer Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: /Save client/i }));

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>;
    await waitFor(() => {
      const posts = calls.filter((call) => call[1]?.method === "POST");
      expect(posts.length, "the form must POST the new client").toBe(1);
      const body = JSON.parse(String(posts[0]?.[1]?.body));
      expect(body.name).toBe("New Customer Ltd");
      expect(body.status).toBe("active");
    });
    // …and the list is re-read afterwards (a GET, not the POST response).
    await waitFor(() => {
      const gets = calls.filter((call) => call[1]?.method !== "POST");
      expect(gets.length).toBeGreaterThan(1);
    });
  });
});

describe("client detail — four states, never three", () => {
  it("a 500 states the failure and renders no record", async () => {
    mockFetch([fail(`/api/data/clients/${CLIENT.id}`), fail("/api/data/projects")]);
    renderClientDetail();
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    expect(screen.queryByText(/Acme Testing Ltd/i)).toBeNull();
    expect(screen.queryByText(/No projects yet/i)).toBeNull();
  });

  it("a 404 says the store was read and holds no such client", async () => {
    mockFetch([fail(`/api/data/clients/${CLIENT.id}`, 404), fail("/api/data/projects", 404)]);
    renderClientDetail();
    await waitFor(() => expect(screen.getByText(/No client with this id/i)).toBeTruthy());
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });

  it("control: a stored client renders, and 'No projects yet' is honest when the read succeeded", async () => {
    mockFetch([
      { match: urlIs(`/api/data/clients/${CLIENT.id}`), body: { data: CLIENT } },
      { match: urlIs("/api/data/projects"), body: { data: [] } },
    ]);
    renderClientDetail();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Acme Testing Ltd" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/No projects yet/i)).toBeTruthy());
    expect(screen.queryByText(/could not be read/i)).toBeNull();
  });

  it("shows the projects that belong to the client", async () => {
    mockFetch([
      { match: urlIs(`/api/data/clients/${CLIENT.id}`), body: { data: CLIENT } },
      { match: urlIs("/api/data/projects"), body: { data: [PROJECT] } },
    ]);
    renderClientDetail();
    const link = await screen.findByRole("link", { name: "Q4 onboarding rollout" });
    expect(link.getAttribute("href")).toBe(`/portal/projects/${PROJECT.id}`);
  });

  it("a failed projects read does not hide the client that WAS read", async () => {
    mockFetch([{ match: urlIs(`/api/data/clients/${CLIENT.id}`), body: { data: CLIENT } }, fail("/api/data/projects")]);
    renderClientDetail();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Acme Testing Ltd" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/projects could not be read/i)).toBeTruthy());
    expect(screen.queryByText(/No projects yet/i)).toBeNull();
  });
});

describe("projects — an unreadable project store is not an empty one", () => {
  it("a 500 on the projects read states the failure and suppresses 'No projects yet'", async () => {
    mockFetch([fail("/api/data/projects"), { match: urlIs("/api/data/clients"), body: { data: [CLIENT] } }]);
    renderProjects();
    await waitFor(() => expect(screen.getByText(/project list could not be read/i)).toBeTruthy());
    expect(screen.queryByText(/No projects yet/i)).toBeNull();
  });

  it("control: a real empty workspace still says 'No projects yet'", async () => {
    mockFetch([
      { match: urlIs("/api/data/projects"), body: { data: [] } },
      { match: urlIs("/api/data/clients"), body: { data: [CLIENT] } },
    ]);
    renderProjects();
    await waitFor(() => expect(screen.getByText(/No projects yet/i)).toBeTruthy());
    expect(screen.queryByText(/project list could not be read/i)).toBeNull();
  });

  it("offers no create form when the workspace has no client to attach a project to", async () => {
    mockFetch([
      { match: urlIs("/api/data/projects"), body: { data: [] } },
      { match: urlIs("/api/data/clients"), body: { data: [] } },
    ]);
    renderProjects();
    await waitFor(() => expect(screen.getByText(/Create a client first/i)).toBeTruthy());
    expect(screen.queryByLabelText("Client")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save project/i })).toBeNull();
  });

  it("a failed clients read does not hide the projects that WERE read", async () => {
    mockFetch([{ match: urlIs("/api/data/projects"), body: { data: [PROJECT] } }, fail("/api/data/clients")]);
    renderProjects();
    await waitFor(() => expect(screen.getByRole("link", { name: "Q4 onboarding rollout" })).toBeTruthy());
    expect(screen.getByText(/Client name unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/No projects yet/i)).toBeNull();
  });
});

describe("project detail", () => {
  it("a 500 states the failure and renders no record", async () => {
    mockFetch([fail(`/api/data/projects/${PROJECT.id}`)]);
    renderProjectDetail();
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy());
    expect(screen.queryByText(/Q4 onboarding rollout/i)).toBeNull();
  });

  it("a stored project renders with a link to the client that owns it", async () => {
    mockFetch([
      { match: urlIs(`/api/data/projects/${PROJECT.id}`), body: { data: PROJECT } },
      { match: urlIs(`/api/data/clients/${CLIENT.id}`), body: { data: CLIENT } },
    ]);
    renderProjectDetail();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Q4 onboarding rollout" })).toBeTruthy());
    const link = await screen.findByRole("link", { name: "Acme Testing Ltd" });
    expect(link.getAttribute("href")).toBe(`/portal/clients/${CLIENT.id}`);
  });
});

describe("route wiring — every new page is mounted at a real URL", () => {
  const routes = routePaths();
  const cases: Array<[string, string, string]> = [
    ["src/routes/portal.clients.index.tsx", "/portal/clients", "~/lazy/portal.clients.index.page"],
    ["src/routes/portal.clients.$clientId.tsx", "/portal/clients/$clientId", "~/lazy/portal.clients.$clientId.page"],
    ["src/routes/portal.projects.index.tsx", "/portal/projects", "~/lazy/portal.projects.index.page"],
    ["src/routes/portal.projects.$projectId.tsx", "/portal/projects/$projectId", "~/lazy/portal.projects.$projectId.page"],
  ];

  for (const [file, path, page] of cases) {
    it(`${path} exists in the route tree and mounts ${page}`, () => {
      expect(existsSync(file), `${file} must exist`).toBe(true);
      const src = readFileSync(file, "utf8");
      const declared = src.match(/createFileRoute\("([^"]+)"\)/)?.[1] ?? "";
      // Compare the DECLARED path to the path this test expects, ignoring the
      // trailing slash TanStack uses for index routes.
      expect(declared.replace(/\/$/, "")).toBe(path.replace(/\/$/, ""));
      expect(src).toContain(page);
      // The route tree is the system of record for URLs, not the `path:` literal.
      expect(matchesRoute(path, routes), `${path} resolves to no route`).toBe(true);
    });
  }
});
