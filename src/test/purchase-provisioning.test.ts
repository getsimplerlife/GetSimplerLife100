import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Must match the DATA_DIR used by prod-server.ts when started from the repo
// without a DATA_DIR override: <repo>/.data (see src/lib/data-store.ts resolveDataDir).
const PURCHASES_FILE = join(process.cwd(), ".data", "tenant_purchases.json");

const TEST_EMAIL = "e2e-provisioning@" + Date.now() + ".test";

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

function readPurchases(): Record<string, any[]> {
  if (!existsSync(PURCHASES_FILE)) return {};
  return JSON.parse(readFileSync(PURCHASES_FILE, "utf-8"));
}

function removeTestEmail() {
  const p = readPurchases();
  if (p[TEST_EMAIL]) { delete p[TEST_EMAIL]; writeFileSync(PURCHASES_FILE, JSON.stringify(p, null, 2)); }
}

describe("End-to-end purchase provisioning", () => {
  beforeAll(() => {
    // Ensure the data dir exists
    const dir = join(PURCHASES_FILE, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });

  afterAll(() => {
    removeTestEmail();
  });

  it("server is reachable on port 3000", async () => {
    const res = await fetch("http://localhost:3000/");
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(500);
  });

  it("provisions a purchase via Stripe webhook, records it, and enables monitoring", async () => {
    // Simulate checkout.session.completed from Stripe
    const webhookBody = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_e2e_" + Date.now(),
          object: "checkout.session",
          customer_details: { email: TEST_EMAIL },
          customer_email: TEST_EMAIL,
          payment_link: "https://buy.stripe.com/test_e2e_" + Date.now(),
          amount_total: 95000,
          metadata: {},
        },
      },
    };

    const { status, json } = await post("/api/stripe/webhook", webhookBody);

    // Webhook should accept the event
    expect(status).toBe(200);
    expect(json.received).toBe(true);

    // Purchase should be recorded on disk
    const purchases = readPurchases();
    const userPurchases = purchases[TEST_EMAIL];
    expect(userPurchases).toBeDefined();
    expect(userPurchases.length).toBeGreaterThanOrEqual(1);
    expect(userPurchases[0].status).toBe("active");
    expect(userPurchases[0].amount).toBe(95000);
  });

  it("entitled tenant is accepted at monitoring webhook after purchase", async () => {
    const { json } = await post("/api/monitoring/webhook/hubspot", {
      employeeId: "emp-invoice-ledger-ai",
      eventType: "invoice.created",
      tenantId: TEST_EMAIL,
      payload: { invoice: "post-purchase-test" },
    });

    expect(json.status).toBe("processed");
    expect(json.dispatchedTo).toBe("emp-invoice-ledger-ai");
  });

  it("duplicate events are skipped", async () => {
    const eventId = "e2e-dup-" + Date.now();

    const { json: first } = await post("/api/monitoring/webhook/hubspot", {
      id: eventId,
      employeeId: "emp-invoice-ledger-ai",
      eventType: "invoice.created",
      tenantId: TEST_EMAIL,
      payload: { invoice: "dup-1" },
    });
    expect(first.status).toBe("processed");

    const { json: second } = await post("/api/monitoring/webhook/hubspot", {
      id: eventId,
      employeeId: "emp-invoice-ledger-ai",
      eventType: "invoice.created",
      tenantId: TEST_EMAIL,
      payload: { invoice: "dup-2" },
    });
    expect(second.status).toBe("skipped");
    expect(second.reason).toBe("Duplicate event");
  });
});
