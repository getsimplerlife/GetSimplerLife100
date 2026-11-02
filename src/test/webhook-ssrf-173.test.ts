/**
 * webhook-ssrf-173.test.ts — SLICE 173, defect W4.
 *
 * `isPrivateIpLiteral` in native/webhooks/outbound.ts had:
 *
 *     if (host.includes(":")) return false; // other IPv6 form — handled by resolver check
 *
 * so ANY hostname containing a colon skipped the private-address check, and
 * PRIVATE_IPV6_RE (/^::1$|^fc|^fd|^fe80/) missed the IPv4-mapped form. The
 * result: https://[::ffff:127.0.0.1]/hook passed validation and fetch() dialled
 * loopback — a server-side request forgery hole on the tenant-controlled
 * subscriber-URL field.
 *
 * The guard must normalise the hostname once and apply one check to every
 * form: dotted IPv4, bracketed IPv6, IPv4-mapped IPv6 (both the dotted and the
 * hex-serialised form), loopback, link-local, unique-local and unspecified.
 * A normal public https host must still be allowed.
 */
import { describe, expect, it } from "vitest";
import { validateWebhookUrl, type HostResolver } from "../native/webhooks/outbound";

const noDns: HostResolver = async () => {
  throw new Error("resolver must not be consulted for IP literals");
};
const publicDns: HostResolver = async () => ["93.184.216.34"];

describe("W4 — IPv6-mapped loopback / link-local cannot bypass the SSRF guard", () => {
  it("refuses https://[::ffff:127.0.0.1]/hook (IPv4-mapped loopback)", async () => {
    const result = await validateWebhookUrl("https://[::ffff:127.0.0.1]/hook", noDns);
    expect(result.ok).toBe(false);
  });

  it("refuses https://[::ffff:7f00:1]/hook (the same address, hex form the URL parser serialises to)", async () => {
    const result = await validateWebhookUrl("https://[::ffff:7f00:1]/hook", noDns);
    expect(result.ok).toBe(false);
  });

  it("refuses https://[::1]/hook (IPv6 loopback)", async () => {
    const result = await validateWebhookUrl("https://[::1]/hook", noDns);
    expect(result.ok).toBe(false);
  });

  it("refuses https://127.0.0.1/hook (IPv4 loopback)", async () => {
    const result = await validateWebhookUrl("https://127.0.0.1/hook", noDns);
    expect(result.ok).toBe(false);
  });

  it("refuses https://[::ffff:169.254.169.254]/ (IPv4-mapped cloud metadata endpoint)", async () => {
    const result = await validateWebhookUrl("https://[::ffff:169.254.169.254]/", noDns);
    expect(result.ok).toBe(false);
  });

  it("refuses https://169.254.169.254/latest/meta-data/ (IPv4 metadata endpoint)", async () => {
    const result = await validateWebhookUrl("https://169.254.169.254/latest/meta-data/", noDns);
    expect(result.ok).toBe(false);
  });

  it("refuses IPv6 unique-local and link-local literals", async () => {
    for (const url of ["https://[fd00::1]/hook", "https://[fe80::1]/hook", "https://[::]/hook"]) {
      expect((await validateWebhookUrl(url, noDns)).ok, url).toBe(false);
    }
  });

  it("refuses https://[::ffff:10.0.0.5]/hook (IPv4-mapped private range)", async () => {
    expect((await validateWebhookUrl("https://[::ffff:10.0.0.5]/hook", noDns)).ok).toBe(false);
  });

  it("still allows a normal public https host (resolved to a public address)", async () => {
    const result = await validateWebhookUrl("https://hooks.example.com/hook", publicDns);
    expect(result.ok).toBe(true);
  });

  it("still allows a plain public IPv4 literal", async () => {
    expect((await validateWebhookUrl("https://93.184.216.34/hook", noDns)).ok).toBe(true);
  });
});
