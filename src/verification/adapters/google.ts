/**
 * Google Productivity verification adapter — live API checks for the
 * Productivity capability slices (google-drive, google-docs, google-sheets,
 * google-slides).
 *
 * Canonical hosts (never guessed):
 *   - Drive:   https://www.googleapis.com/drive/v3 (+ /upload/drive/v3)
 *   - Docs:    https://docs.googleapis.com/v1
 *   - Sheets:  https://sheets.googleapis.com/v4
 *   - Slides:  https://slides.googleapis.com/v1
 *
 * Token handling: refresh once per run if expired (mutates the shared
 * credential object so later contracts reuse the fresh token).
 *
 * NON-DESTRUCTIVE (owner directive 2026-08-12): write paths (opt-in via
 * --writes) create a labeled Phase7-* artifact and LEAVE IT IN PLACE.
 * Verification never deletes or trashes anything — labeled test files may
 * accumulate in the tenant's Drive; that is the owner's explicit preference
 * over any deletion. No deleteFile/trashFile calls exist in this adapter.
 * Read paths that need an existing file (docs content, sheet ranges, slides
 * resource) either use a credential-provided file id (docId/sheetId/slidesId)
 * or, when --writes is on, create a labeled artifact, read it, and keep it.
 * Unknown capability ids fail closed without network calls.
 */
import { createGDriveClient } from "../../integrations/providers/google-drive/client";
import { refreshGDriveToken } from "../../integrations/providers/google-drive/auth";
import { createGDocsClient } from "../../integrations/providers/google-docs/client";
import { refreshDocsToken } from "../../integrations/providers/google-docs/auth";
import { createGSheetsClient } from "../../integrations/providers/google-sheets/client";
import { refreshSheetsToken } from "../../integrations/providers/google-sheets/auth";
import { createGSlidesClient } from "../../integrations/providers/google-slides/client";
import { refreshSlidesToken } from "../../integrations/providers/google-slides/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import type { CapabilityAdapter } from "./index";
import type { ProviderCredential } from "../credential-source";

const LABEL_PREFIX = "Phase7-VERIFY-";
const label = () => `${LABEL_PREFIX}${Date.now()}`;

function baseAuth(cred: Record<string, unknown>, provider: string, ctx: { app?: { clientId?: string; clientSecret?: string } }) {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return {
    accessToken: (cred.accessToken as string) || "",
    refreshToken: (cred.refreshToken as string) || "",
    expiresAt: (cred.expiresAt as number) || undefined,
    scope: (cred.scope as string) || "",
    clientId: ctx.app?.clientId || "",
    clientSecret: ctx.app?.clientSecret || "",
    redirectUri: base ? `${base}/api/oauth/callback?provider=${provider}` : "",
  };
}

async function ensureFreshCredential(cred: ProviderCredential, app?: { clientId?: string; clientSecret?: string }): Promise<void> {
  const tokenLike = { accessToken: cred.accessToken, refreshToken: cred.refreshToken, expiresAt: cred.expiresAt };
  if (!cred.refreshToken || !isTokenExpired(tokenLike as never)) return;
  if (!app?.clientId || !app?.clientSecret) {
    throw new Error("Google access token expired and OAUTH_GOOGLE_<PROVIDER>_CLIENT_ID/SECRET are not configured — cannot refresh (see .env)");
  }
  // Google tokens all use the same token endpoint; refresh with the provider's module.
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  const cfg = { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: base ? `${base}/api/oauth/callback?provider=${cred.provider ?? "google-docs"}` : "" };
  let refreshed;
  const provider = cred.provider ?? "";
  if (provider === "google-drive") refreshed = await refreshGDriveToken(cfg, cred.refreshToken);
  else if (provider === "google-sheets") refreshed = await refreshSheetsToken(cfg, cred.refreshToken);
  else if (provider === "google-slides") refreshed = await refreshSlidesToken(cfg, cred.refreshToken);
  else refreshed = await refreshDocsToken(cfg, cred.refreshToken);
  cred.accessToken = refreshed.accessToken;
  cred.refreshToken = refreshed.refreshToken;
  cred.expiresAt = refreshed.expiresAt;
  if (refreshed.scope) cred.scope = refreshed.scope;
}

export const googleAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  const accessToken = (cred.accessToken as string) || "";
  if (!accessToken) throw new Error("Google credential has no accessToken");
  await ensureFreshCredential(cred, ctx.app);
  const provider = contract.providerId ?? "";

  switch (contract.capabilityId) {
    /* ── google-drive: understand ── */
    case "google-drive-read-files": {
      const drive = createGDriveClient(baseAuth(cred, "google-drive", ctx) as never);
      const files = await drive.listFiles("trashed = false", 10);
      return { httpStatus: 200, response: { count: files.length, sample: files.slice(0, 3).map((f: any) => ({ id: f.id, name: f.name, mimeType: f.mimeType })) } };
    }
    /* ── google-drive: monitor (changes polling, read-only) ── */
    case "google-drive-monitor-folder-changes": {
      const drive = createGDriveClient(baseAuth(cred, "google-drive", ctx) as never);
      const since = new Date(Date.now() - 3600_000).toISOString();
      const changed = await drive.listChangesSince(since, 10);
      return { httpStatus: 200, response: { count: changed.length, since } };
    }
    /* ── google-drive: automate (non-destructive: labeled folder left in place) ── */
    case "google-drive-write-files": {
      if (!ctx.allowWrites) throw new Error("google-drive-write-files requires --writes (creates a labeled folder, left in place)");
      const drive = createGDriveClient(baseAuth(cred, "google-drive", ctx) as never);
      const name = label();
      const created = await drive.createFolder(name);
      if (!created?.id) throw new Error("Google Drive: createFolder returned no id");
      return { httpStatus: 200, response: { created: created.name, kept: true } };
    }
    /* ── google-docs: understand ── */
    case "google-docs-read-content": {
      const docs = createGDocsClient(baseAuth(cred, "google-docs", ctx) as never);
      const docId = (cred.docId as string) || (cred.documentId as string) || "";
      if (docId) {
        const text = await docs.getDocumentText(docId);
        return { httpStatus: 200, response: { docId, chars: text.length } };
      }
      if (!ctx.allowWrites) {
        throw new Error("google-docs-read-content requires a docId in credentials or --writes to create+read a labeled doc");
      }
      const created = await docs.createDocument(label());
      await docs.insertText(created.id, "Phase7 verification read-back");
      const text = await docs.getDocumentText(created.id);
      return { httpStatus: 200, response: { docId: created.id, chars: text.length } };
    }
    /* ── google-docs: automate (non-destructive: labeled doc left in place) ── */
    case "google-docs-create-from-template": {
      if (!ctx.allowWrites) throw new Error("google-docs-create-from-template requires --writes (creates a labeled doc, left in place)");
      const docs = createGDocsClient(baseAuth(cred, "google-docs", ctx) as never);
      const templateId = (cred.templateId as string) || "";
      const created = templateId
        ? await docs.createDocumentFromTemplate(templateId, label(), { "{{Phase7}}": "verified" })
        : await docs.createDocument(label());
      if (!created?.id) throw new Error("Google Docs: create returned no id");
      await docs.insertText(created.id, "Phase7 verification body");
      const text = await docs.getDocumentText(created.id);
      return { httpStatus: 200, response: { docId: created.id, chars: text.length, template: Boolean(templateId) } };
    }
    /* ── google-sheets: understand ── */
    case "google-sheets-read-ranges": {
      const sheets = createGSheetsClient(baseAuth(cred, "google-sheets", ctx) as never);
      const sheetId = (cred.sheetId as string) || (cred.spreadsheetId as string) || "";
      if (sheetId) {
        const values = await sheets.readRange(sheetId, "Sheet1!A1:D50");
        return { httpStatus: 200, response: { sheetId, rows: values.length } };
      }
      if (!ctx.allowWrites) {
        throw new Error("google-sheets-read-ranges requires a sheetId in credentials or --writes to create+read a labeled sheet");
      }
      const created = await sheets.createSpreadsheet(label());
      await sheets.writeRange(created.spreadsheetId, "Sheet1!A1", [["Phase7", "verified"]]);
      const values = await sheets.readRange(created.spreadsheetId, "Sheet1!A1:B1");
      return { httpStatus: 200, response: { sheetId: created.spreadsheetId, rows: values.length } };
    }
    /* ── google-sheets: automate (non-destructive: labeled sheet left in place) ── */
    case "google-sheets-write-values": {
      if (!ctx.allowWrites) throw new Error("google-sheets-write-values requires --writes (creates a labeled sheet, writes values, left in place)");
      const sheets = createGSheetsClient(baseAuth(cred, "google-sheets", ctx) as never);
      const created = await sheets.createSpreadsheet(label(), ["Sheet1"]);
      const written = await sheets.writeRange(created.spreadsheetId, "Sheet1!A1:C2", [
        ["Phase7", "verify", "write"],
        ["a", "b", "c"],
      ]);
      const values = await sheets.readRange(created.spreadsheetId, "Sheet1!A1:C2");
      return { httpStatus: 200, response: { sheetId: created.spreadsheetId, updated: written.updatedCells ?? written.updatedRange ?? "", rowsReadBack: values.length } };
    }
    /* ── google-slides: understand ── */
    case "google-slides-read-presentation": {
      const slides = createGSlidesClient(baseAuth(cred, "google-slides", ctx) as never);
      const slidesId = (cred.slidesId as string) || (cred.presentationId as string) || "";
      if (slidesId) {
        const pres = await slides.getPresentation(slidesId);
        return { httpStatus: 200, response: { slidesId, slideCount: (pres.slides || []).length } };
      }
      if (!ctx.allowWrites) {
        throw new Error("google-slides-read-presentation requires a slidesId in credentials or --writes to create+read a labeled presentation");
      }
      const created = await slides.createPresentation(label());
      const pres = await slides.getPresentation(created.presentationId);
      return { httpStatus: 200, response: { slidesId: created.presentationId, slideCount: (pres.slides || []).length } };
    }
    /* ── google-slides: automate (non-destructive: labeled presentation left in place) ── */
    case "google-slides-create-presentation": {
      if (!ctx.allowWrites) throw new Error("google-slides-create-presentation requires --writes (creates a labeled presentation, left in place)");
      const slides = createGSlidesClient(baseAuth(cred, "google-slides", ctx) as never);
      const created = await slides.createPresentationFromOutline(label(), [{ title: "Phase7", body: "verification" }]);
      if (!created?.presentationId) throw new Error("Google Slides: create returned no presentation id");
      return { httpStatus: 200, response: { slidesId: created.presentationId, slides: created.slideIds?.length ?? 0 } };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};
