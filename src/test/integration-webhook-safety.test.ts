import { describe, expect, it } from "vitest";
import { handleWebhookReceiver } from "../api/integrationRoutes";

describe("runtime webhook fail-closed routing", () => {
  it("rejects legacy provider-wide webhook routes without scanning tenants", async () => {
    const response = await handleWebhookReceiver(new Request("https://example.test/api/webhooks/zendesk", { method: "POST", body: "{}" }));
    expect(response.status).toBe(404);
  });
  it("requires signature and exact connection route", async () => {
    const response = await handleWebhookReceiver(new Request("https://example.test/api/webhooks/zendesk/conn-a", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    const accepted = await handleWebhookReceiver(new Request("https://example.test/api/webhooks/zendesk/conn-a", { method: "POST", headers: { "x-zendesk-webhook-signature": "t=1,v1=bad" }, body: "{}" }));
    expect(accepted.status).toBe(503);
    expect(await accepted.json()).toMatchObject({ accepted: false, connectionId: "conn-a" });
  });
});
