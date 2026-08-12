#!/usr/bin/env bun
/**
 * Google Productivity OAuth flow verifier (Phase 7 prep — live credentials).
 *
 * Proves the end-to-end OAuth configuration for the four Google productivity
 * providers (google-drive, google-docs, google-sheets, google-slides) using the
 * REAL app credentials from the environment / .env files:
 *
 *   1. Credentials resolve (OAUTH_<PROVIDER>_CLIENT_ID / _CLIENT_SECRET).
 *   2. The provider auth module's OAuthConfig tokenUrl is exactly
 *      https://oauth2.googleapis.com/token.
 *   3. The built authorize URL carries:
 *        - client_id == the configured credential
 *        - redirect_uri == OAUTH_REDIRECT_BASE + /api/oauth/callback
 *        - response_type=code, state
 *        - access_type=offline + prompt=consent (REQUIRED so Google issues a
 *          refresh token; without it the connection dies when the access token
 *          expires and the hourly token refresher has nothing to refresh)
 *
 * The generated Connect URL is printed for the owner to click (client_id,
 * redirect_uri, and scopes are public OAuth metadata — never the client_secret).
 *
 * Usage:
 *   bun run scripts/verify-google-oauth-flow.ts
 *
 * Exit code 0 = every provider's flow verified; 1 = any check failed.
 * No tokens are printed. No tenant data is touched.
 */
import { getGDriveOAuthConfig } from "../src/integrations/providers/google-drive/auth";
import { getGDocsOAuthConfig } from "../src/integrations/providers/google-docs/auth";
import { getGSheetsOAuthConfig } from "../src/integrations/providers/google-sheets/auth";
import { getGSlidesOAuthConfig } from "../src/integrations/providers/google-slides/auth";

const PROVIDERS = [
  { id: "google-drive", label: "Google Drive", getConfig: getGDriveOAuthConfig },
  { id: "google-docs", label: "Google Docs", getConfig: getGDocsOAuthConfig },
  { id: "google-sheets", label: "Google Sheets", getConfig: getGSheetsOAuthConfig },
  { id: "google-slides", label: "Google Slides", getConfig: getGSlidesOAuthConfig },
] as const;

function resolveCreds(providerId: string): { clientId: string; clientSecret: string } | null {
  const upper = providerId.replace(/-/g, "_").toUpperCase();
  const id = process.env[`OAUTH_${upper}_CLIENT_ID`];
  const secret = process.env[`OAUTH_${upper}_CLIENT_SECRET`];
  if (id && secret) return { clientId: id, clientSecret: secret };
  return null;
}

function mask(id: string): string {
  if (id.length <= 12) return "****";
  return `${id.slice(0, 8)}...${id.slice(-8)}`;
}

function expectParam(url: URL, name: string, expected?: string): string | null {
  const got = url.searchParams.get(name);
  if (!got) return `missing param ${name}`;
  if (expected !== undefined && got !== expected) {
    return `param ${name} mismatch (expected ${expected})`;
  }
  return null;
}

async function main(): Promise<number> {
  const redirectBase = process.env.OAUTH_REDIRECT_BASE;
  const expectedRedirect = redirectBase ? `${redirectBase}/api/oauth/callback` : null;
  console.log(`OAUTH_REDIRECT_BASE: ${redirectBase ?? "❌ NOT SET"}`);
  console.log(`expected redirect_uri: ${expectedRedirect ?? "n/a"}`);
  console.log("");

  let failures = 0;

  for (const p of PROVIDERS) {
    const creds = resolveCreds(p.id);
    if (!creds) {
      console.log(`❌ ${p.label} (${p.id}): credentials NOT resolvable`);
      failures++;
      continue;
    }
    const cfg = p.getConfig({ clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: expectedRedirect ?? "https://placeholder.invalid/api/oauth/callback" });

    // 1. tokenUrl exact match
    if (cfg.tokenUrl !== "https://oauth2.googleapis.com/token") {
      console.log(`❌ ${p.label}: tokenUrl = ${cfg.tokenUrl} (expected https://oauth2.googleapis.com/token)`);
      failures++;
      continue;
    }

    // 2. authorizeUrl is Google's OAuth v2 endpoint
    if (cfg.authorizeUrl !== "https://accounts.google.com/o/oauth2/v2/auth") {
      console.log(`❌ ${p.label}: authorizeUrl = ${cfg.authorizeUrl} (unexpected)`);
      failures++;
      continue;
    }

    // 3. Build the real authorize URL
    const mod = await import(`../src/integrations/providers/${p.id}/auth.ts`);
    const buildFn = Object.keys(mod).find((k) => k.startsWith("build") && k.endsWith("AuthUrl")) as string | undefined;
    if (!buildFn) {
      console.log(`❌ ${p.label}: no build*AuthUrl export`);
      failures++;
      continue;
    }
    const buildAny = mod as unknown as Record<string, (c: Record<string, string>) => Promise<{ url: string; state: string; verifier: string } | string>>;
    const result = await buildAny[buildFn]({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri: expectedRedirect ?? "https://placeholder.invalid/api/oauth/callback",
    });
    const rawUrl = typeof result === "string" ? result : result.url;
    const url = new URL(rawUrl);

    const checks: Array<[string, string | null]> = [
      ["client_id", expectParam(url, "client_id", creds.clientId)],
      ["redirect_uri", expectParam(url, "redirect_uri", expectedRedirect ?? undefined)],
      ["response_type", expectParam(url, "response_type", "code")],
      ["state", expectParam(url, "state")],
      ["access_type", expectParam(url, "access_type", "offline")],
      ["prompt", expectParam(url, "prompt", "consent")],
    ];
    const bad = checks.filter(([, err]) => err !== null);
    if (bad.length > 0) {
      console.log(`❌ ${p.label} (${p.id}):`);
      for (const [name, err] of bad) console.log(`    - ${name}: ${err}`);
      failures++;
      continue;
    }

    const pkce = url.searchParams.get("code_challenge");
    console.log(`✅ ${p.label} (${p.id})`);
    console.log(`    client_id:     ${mask(creds.clientId)}`);
    console.log(`    authorizeUrl:  ${cfg.authorizeUrl}`);
    console.log(`    tokenUrl:      ${cfg.tokenUrl}`);
    console.log(`    scopes[${cfg.scopes.length}]: ${cfg.scopes.join(" ")}`);
    console.log(`    redirect_uri:  ${url.searchParams.get("redirect_uri")}`);
    console.log(`    pkce:          ${pkce ? "present (S256)" : "not used (confidential client — OK)"}`);
    console.log(`    connect URL:   ${rawUrl}`);
    console.log("");
  }

  console.log(failures === 0 ? "ALL GOOGLE PROVIDER FLOWS VERIFIED" : `${failures} provider flow(s) FAILED`);
  return failures === 0 ? 0 : 1;
}

process.exit(await main());
