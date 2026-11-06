/**
 * front-door-194a.test.tsx — SLICE 194a: the front door, part 1.
 *
 * Three defects, all of them a customer being told something untrue at the
 * moment they are trying to get in. Each test below FAILS on the pre-194a code
 * (noted per test) and passes after it:
 *
 *  1. A paying customer could not log in. A purchase provisions the buyer's
 *     account with NO password (`provisionAccountForPurchase`), and
 *     `/api/login` handed that row to `bcrypt.compare(password, undefined)`.
 *     bcrypt rejects a non-string, the route wrapper caught the throw and
 *     answered 400 "Invalid request", which /login printed verbatim — a paying
 *     customer was told their credential was wrong when we had never made one.
 *  2. `/set-password` set "a code has been sent" on ANY 2xx without reading
 *     `data.sent`, which the server returns false for both a no-account address
 *     and a failed mail send. It promised a one-time code with a 10-minute
 *     clock and nothing to type.
 *  3. After a successful reset the page was a dead end: the only sign-in link
 *     lived inside the form, which is not rendered in the done state, and the
 *     server returns no session.
 *
 * The router plumbing is stubbed (Link → a real anchor, useNavigate → a no-op)
 * so the route components can be rendered outside a RouterProvider; the
 * components themselves are the real files. The login-path tests run against
 * the self-hosted test server, because the defect was in the server's answer,
 * not in the page's markup.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { hash } from "bcryptjs";
import { accountHasNoPassword } from "../lib/account-password-state";
import { provisionAccountForPurchase } from "../lib/purchase-sales-events";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

// Stub only the router plumbing. `Link` renders an anchor whose href is the
// `to` target — which is exactly what the done-state assertion needs to see.
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    createFileRoute: () => (options: any) => ({ options }),
    Link: ({ to, children, ...rest }: any) =>
      React.createElement("a", { href: to, ...rest }, children),
    useNavigate: () => () => {},
  };
});

import { Route as SetPasswordRoute } from "../routes/set-password";
import { Route as LoginRoute } from "../routes/login";

const SetPasswordPage = (SetPasswordRoute as any).options.component as React.ComponentType;
const LoginPage = (LoginRoute as any).options.component as React.ComponentType;

// ─── fetch harness for the render tests ──────────────────────────────────────
// The real fetch is restored after every test: the server-level tests below hit
// the self-hosted test server for real, and must never inherit a stub.
const realFetch = globalThis.fetch;

interface FetchCall {
  url: string;
  body: any;
}

/**
 * Install a fetch that answers by endpoint. `sent` is what the reset endpoint
 * returns in its body — the whole point of defect 2 is that the page must read
 * it instead of trusting the 200.
 */
function installFetch(handlers: {
  requestReset?: (body: any) => any;
  setPassword?: (body: any) => any;
}): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    let body: any = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }
    calls.push({ url, body });
    const payload =
      url.includes("request-password-reset")
        ? handlers.requestReset?.(body)
        : handlers.setPassword?.(body);
    return new Response(JSON.stringify(payload ?? {}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;
  return calls;
}

beforeEach(() => {
  globalThis.fetch = realFetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  cleanup();
});

// ─── 1. The passwordless state is a known state ──────────────────────────────
describe("194a — 'no password yet' is a state, not a bad credential", () => {
  it("treats an absent, empty or non-string password as nothing to compare", () => {
    // A record with no password at all is the state a purchase leaves behind.
    expect(accountHasNoPassword({ email: "buyer@example.com" })).toBe(true);
    expect(accountHasNoPassword({ password: "" })).toBe(true);
    expect(accountHasNoPassword({ password: "   " })).toBe(true);
    // A corrupt/half-written row is still "nothing to compare", never a throw.
    expect(accountHasNoPassword({ password: 12345 })).toBe(true);
    expect(accountHasNoPassword({ password: null })).toBe(true);
    // A real credential must be COMPARED, never short-circuited.
    expect(accountHasNoPassword({ password: "$2a$10$abcdefghijklmnopqrstuv" })).toBe(false);
  });

  it("a purchase records the passwordless state explicitly (fails before 194a: no flag)", () => {
    const { users: next, outcome } = provisionAccountForPurchase({}, "newbuyer@example.com");
    expect(outcome).toBe("created");
    const record = next["newbuyer@example.com"];
    // The flag is the known state the login lane reads.
    expect(record.passwordSet).toBe(false);
    // Still no password field — the customer sets one via the set-password lane.
    expect("password" in record).toBe(false);
    expect(accountHasNoPassword(record)).toBe(true);
  });

  it("never overwrites a real password when upgrading an existing account", () => {
    const users = {
      "existing@example.com": { email: "existing@example.com", password: "bc-hash", createdAt: 1 },
    };
    const { users: next, outcome } = provisionAccountForPurchase(users, "existing@example.com");
    expect(outcome).toBe("upgraded");
    expect(next["existing@example.com"].password).toBe("bc-hash");
    expect(next["existing@example.com"].passwordSet).toBeUndefined();
    expect(accountHasNoPassword(next["existing@example.com"])).toBe(false);
  });
});

// ─── 2. /set-password must read `sent`, and the done state must lead somewhere ─
describe("194a — /set-password tells the truth about the send", () => {
  const fillEmailAndSend = () => {
    render(<SetPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset code/i }));
  };

  it("a 2xx with sent:false says nothing was sent and does NOT advance (fails before 194a)", async () => {
    installFetch({ requestReset: () => ({ success: true, sent: false }) });
    fillEmailAndSend();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/could not send a reset code/i);
    // The honest sentence is about the SEND, never about whether an account
    // exists — the anti-enumeration posture is unchanged.
    expect(alert.textContent).not.toMatch(/no account|does not exist|not found/i);
    // The old code advanced to the code step and promised a code was sent.
    expect(screen.queryByLabelText(/one-time code/i)).toBeNull();
    expect(screen.queryByText(/a one-time reset code has been sent to it/i)).toBeNull();
  });

  it("POSITIVE CONTROL: a 2xx with sent:true still advances to the code step", async () => {
    installFetch({ requestReset: () => ({ success: true, sent: true }) });
    fillEmailAndSend();

    await waitFor(() => expect(screen.getByLabelText(/one-time code/i)).toBeTruthy());
    expect(screen.getByText(/a one-time reset code has been sent to it/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the done state carries a working link to /login (fails before 194a: dead end)", async () => {
    installFetch({
      requestReset: () => ({ success: true, sent: true }),
      setPassword: () => ({ success: true }),
    });
    fillEmailAndSend();

    await waitFor(() => expect(screen.getByLabelText(/one-time code/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/one-time code/i), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "a-good-password" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "a-good-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(screen.getByText(/your password was changed successfully/i)).toBeTruthy());

    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link.getAttribute("href")).toBe("/login");
    // The form (and its own "Back to Sign In" link) is gone — the link that
    // remains must be the one rendered by the done state itself.
    expect(screen.queryByLabelText(/one-time code/i)).toBeNull();
  });
});

// ─── 3. The login page prints the honest sentence and points at the fix ──────
describe("194a — /login renders a passwordless answer honestly", () => {
  it("shows the server's sentence and a link to /set-password (fails before 194a: 'Invalid request')", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: "This account has no password set — check your email for a set-password link.",
          code: "password_not_set",
          setPasswordPath: "/set-password",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      )) as any;

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "whatever" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no password set/i);
    expect(alert.textContent).not.toMatch(/invalid request/i);
    // The honest sentence is followed by the action that fixes it.
    const fixLink = alert.querySelector('a[href="/set-password"]');
    expect(fixLink, "the passwordless answer must point at /set-password").toBeTruthy();
  });
});

// ─── 4. The server lane, against the real self-hosted test server ────────────
const TEST_DATA_DIR = testDataDir();
const USERS_FILE = join(TEST_DATA_DIR, "users.json");
const BASE_URL = testBaseUrl();

const TS = Date.now();
const PASSWORDLESS_EMAIL = "passwordless-buyer-" + TS + "@test.example";
const PASSWORDLESS_NOJS_EMAIL = "passwordless-nojs-" + TS + "@test.example";
const NORMAL_EMAIL = "normal-buyer-" + TS + "@test.example";
const NORMAL_PASSWORD = "a-real-password-123";

function readUsers(): any {
  if (!existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function seedUser(email: string, record: Record<string, unknown>) {
  const users = readUsers();
  users[email] = record;
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function removeSeededUsers() {
  if (!existsSync(USERS_FILE)) return;
  const users = readUsers();
  let changed = false;
  for (const email of [PASSWORDLESS_EMAIL, PASSWORDLESS_NOJS_EMAIL, NORMAL_EMAIL]) {
    if (users[email]) {
      delete users[email];
      changed = true;
    }
  }
  if (changed) writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

beforeAll(async () => {
  await ensureTestServer();
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  removeSeededUsers();
  // Exactly the record a real purchase leaves behind: source "purchase", no
  // password field, passwordSet false.
  const { users: provisioned } = provisionAccountForPurchase({}, PASSWORDLESS_EMAIL);
  seedUser(PASSWORDLESS_EMAIL, provisioned[PASSWORDLESS_EMAIL]);
  seedUser(PASSWORDLESS_NOJS_EMAIL, {
    email: PASSWORDLESS_NOJS_EMAIL,
    role: "user",
    createdAt: Date.now(),
    source: "purchase",
    purchased: true,
    passwordSet: false,
  });
  seedUser(NORMAL_EMAIL, {
    email: NORMAL_EMAIL,
    password: await hash(NORMAL_PASSWORD, 4),
    role: "user",
    createdAt: Date.now(),
  });
});

afterAll(removeSeededUsers);

describe("194a — /api/login answers a passwordless account honestly", () => {
  it("returns a distinct, honest message instead of 400 'Invalid request' (fails before 194a)", async () => {
    const res = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: PASSWORDLESS_EMAIL, password: "anything-they-type" }),
    });
    const body: any = await res.json().catch(() => ({}));

    expect(res.status).not.toBe(400);
    expect(body.error).not.toBe("Invalid request");
    expect(body.error).toMatch(/no password set/i);
    expect(body.code).toBe("password_not_set");
    expect(body.setPasswordPath).toBe("/set-password");
    // Nothing was authenticated: no session cookie may be issued.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("POSITIVE CONTROL: a real password still signs in, and a wrong one is 401", async () => {
    const ok = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: NORMAL_EMAIL, password: NORMAL_PASSWORD }),
    });
    expect(ok.status).toBe(200);

    const wrong = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: NORMAL_EMAIL, password: "not-the-password" }),
    });
    const wrongBody: any = await wrong.json().catch(() => ({}));
    expect(wrong.status).toBe(401);
    expect(wrongBody.error).toMatch(/invalid email or password/i);
    expect(wrongBody.code).toBeUndefined();
  });

  it("the no-JS form POST answers the same way instead of 'Something went wrong'", async () => {
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: PASSWORDLESS_NOJS_EMAIL, password: "whatever" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    const decoded = decodeURIComponent(location.replace(/\+/g, " "));
    expect(decoded).toMatch(/no password set/i);
    expect(decoded).not.toMatch(/invalid credentials/i);
    expect(decoded).not.toMatch(/something went wrong/i);
  });
});
