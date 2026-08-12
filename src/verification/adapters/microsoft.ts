/**
 * Microsoft Productivity verification adapter — live API checks for the
 * Productivity capability slices (onedrive, microsoft-word, microsoft-excel,
 * microsoft-powerpoint).
 *
 * Canonical hosts (never guessed):
 *   - Graph: https://graph.microsoft.com/v1.0
 *   - Auth:  https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *
 * Token handling: refresh once per run if expired (mutates the shared
 * credential object so later contracts reuse the fresh token).
 *
 * NON-DESTRUCTIVE (owner directive 2026-08-12): write paths (opt-in via
 * --writes) create a labeled Phase7-* artifact and LEAVE IT IN PLACE.
 * Verification never deletes or trashes anything — labeled test files may
 * accumulate in the tenant's OneDrive; that is the owner's explicit preference
 * over any deletion. No deleteFile/trashFile calls exist in this adapter.
 * Read paths that need an existing file either use a credential-provided file
 * id (fileId/wordId/excelId/powerpointId) or, when --writes is on, create a
 * labeled artifact, read it, and keep it. Unknown capability ids fail closed
 * without network calls.
 */
import { createODClient } from "../../integrations/providers/onedrive/client";
import { refreshODToken } from "../../integrations/providers/onedrive/auth";
import { createWordClient } from "../../integrations/providers/microsoft-word/client";
import { refreshWordToken } from "../../integrations/providers/microsoft-word/auth";
import { createExcelClient } from "../../integrations/providers/microsoft-excel/client";
import { refreshExcelToken } from "../../integrations/providers/microsoft-excel/auth";
import { createPowerPointClient } from "../../integrations/providers/microsoft-powerpoint/client";
import { refreshPowerPointToken } from "../../integrations/providers/microsoft-powerpoint/auth";
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
    tenantId: (cred.tenantId as string) || "common",
    redirectUri: base ? `${base}/api/oauth/callback?provider=${provider}` : "",
  };
}

async function ensureFreshCredential(cred: ProviderCredential, app?: { clientId?: string; clientSecret?: string }): Promise<void> {
  const tokenLike = { accessToken: cred.accessToken, refreshToken: cred.refreshToken, expiresAt: cred.expiresAt };
  if (!cred.refreshToken || !isTokenExpired(tokenLike as never)) return;
  if (!app?.clientId || !app?.clientSecret) {
    throw new Error("Microsoft access token expired and OAUTH_<PROVIDER>_CLIENT_ID/SECRET are not configured — cannot refresh (see .env)");
  }
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  const cfg = {
    clientId: app.clientId,
    clientSecret: app.clientSecret,
    redirectUri: base ? `${base}/api/oauth/callback?provider=${cred.provider ?? "onedrive"}` : "",
    tenantId: (cred.tenantId as string) || "common",
  };
  let refreshed;
  const provider = cred.provider ?? "";
  if (provider === "microsoft-word") refreshed = await refreshWordToken(cfg, cred.refreshToken);
  else if (provider === "microsoft-excel") refreshed = await refreshExcelToken(cfg, cred.refreshToken);
  else if (provider === "microsoft-powerpoint") refreshed = await refreshPowerPointToken(cfg, cred.refreshToken);
  else refreshed = await refreshODToken(cfg, cred.refreshToken);
  cred.accessToken = refreshed.accessToken;
  cred.refreshToken = refreshed.refreshToken;
  cred.expiresAt = refreshed.expiresAt;
  if (refreshed.scope) cred.scope = refreshed.scope;
}

export const microsoftAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  const accessToken = (cred.accessToken as string) || "";
  if (!accessToken) throw new Error("Microsoft credential has no accessToken");
  await ensureFreshCredential(cred, ctx.app);
  const provider = contract.providerId ?? "";

  switch (contract.capabilityId) {
    /* ── onedrive: understand ── */
    case "onedrive-read-files": {
      const od = createODClient(baseAuth(cred, "onedrive", ctx) as never);
      const items = await od.listRootItems();
      return { httpStatus: 200, response: { items: items.length, drive: "me" } };
    }
    /* ── onedrive: monitor ── */
    case "onedrive-monitor-changes": {
      const od = createODClient(baseAuth(cred, "onedrive", ctx) as never);
      const changes = await od.listChangesSince();
      return { httpStatus: 200, response: { changes: changes.length, deltaCursorAvailable: Boolean(changes[0]?.deltaToken) } };
    }
    /* ── onedrive: automate ── */
    case "onedrive-write-files": {
      if (!ctx.allowWrites) throw new Error("onedrive-write-files requires --writes (uploads a labeled file and leaves it in place)");
      const od = createODClient(baseAuth(cred, "onedrive", ctx) as never);
      const name = `${label()}.txt`;
      const created = await od.uploadFile(name, "Phase7 verification payload", "text/plain");
      if (!created?.id) throw new Error("OneDrive: upload returned no id");
      const content = await od.getFileContent(created.id);
      return { httpStatus: 200, response: { fileId: created.id, name, bytes: content.length, kept: true } };
    }
    /* ── microsoft-word: understand ── */
    case "microsoft-word-read-content": {
      const word = createWordClient(baseAuth(cred, "microsoft-word", ctx) as never);
      const fileId = (cred.fileId as string) || (cred.wordId as string) || "";
      if (fileId) {
        const text = await word.readWordDocumentText(fileId);
        return { httpStatus: 200, response: { fileId, chars: text.length } };
      }
      if (!ctx.allowWrites) {
        throw new Error("microsoft-word-read-content requires a fileId in credentials or --writes to create+read+keep a labeled doc");
      }
      const created = await word.createWordDocument(label(), ["Phase7 verification read-back"]);
      if (!created?.id) throw new Error("Microsoft Word: create returned no id");
      const text = await word.readWordDocumentText(created.id);
      return { httpStatus: 200, response: { fileId: created.id, chars: text.length, kept: true } };
    }
    /* ── microsoft-word: automate ── */
    case "microsoft-word-create-document": {
      if (!ctx.allowWrites) throw new Error("microsoft-word-create-document requires --writes (creates a labeled doc and leaves it in place)");
      const word = createWordClient(baseAuth(cred, "microsoft-word", ctx) as never);
      const created = await word.createWordDocument(label(), ["Phase7", "verification", "write"]);
      if (!created?.id) throw new Error("Microsoft Word: create returned no id");
      const text = await word.readWordDocumentText(created.id);
      return { httpStatus: 200, response: { fileId: created.id, chars: text.length, roundTrip: text.includes("verification"), kept: true } };
    }
    /* ── microsoft-excel: understand ── */
    case "microsoft-excel-read-ranges": {
      const excel = createExcelClient(baseAuth(cred, "microsoft-excel", ctx) as never);
      const fileId = (cred.fileId as string) || (cred.excelId as string) || "";
      if (fileId) {
        const values = await excel.readWorkbookRange(fileId, "Sheet1!A1:D50");
        return { httpStatus: 200, response: { fileId, rows: values.length } };
      }
      if (!ctx.allowWrites) {
        throw new Error("microsoft-excel-read-ranges requires a fileId in credentials or --writes to create+read+keep a labeled workbook");
      }
      const created = await excel.createExcelWorkbook(label(), [["Phase7", "verify"]]);
      if (!created?.id) throw new Error("Microsoft Excel: create returned no id");
      const values = await excel.readWorkbookRange(created.id, "Sheet1!A1:B1");
      return { httpStatus: 200, response: { fileId: created.id, rows: values.length, kept: true } };
    }
    /* ── microsoft-excel: automate ── */
    case "microsoft-excel-write-values": {
      if (!ctx.allowWrites) throw new Error("microsoft-excel-write-values requires --writes (creates a labeled workbook, writes values, and leaves it in place)");
      const excel = createExcelClient(baseAuth(cred, "microsoft-excel", ctx) as never);
      const created = await excel.createExcelWorkbook(label(), [["Phase7", "verify", "write"]]);
      if (!created?.id) throw new Error("Microsoft Excel: create returned no id");
      await excel.writeWorkbookRange(created.id, "Sheet1!A1:C2", [
        ["Phase7", "verify", "write"],
        ["a", "b", "c"],
      ]);
      const values = await excel.readWorkbookRange(created.id, "Sheet1!A1:C2");
      return { httpStatus: 200, response: { fileId: created.id, rowsReadBack: values.length, cells: values.flat().length, kept: true } };
    }
    /* ── microsoft-powerpoint: understand ── */
    case "microsoft-powerpoint-read-presentation": {
      const ppt = createPowerPointClient(baseAuth(cred, "microsoft-powerpoint", ctx) as never);
      const fileId = (cred.fileId as string) || (cred.powerpointId as string) || "";
      if (fileId) {
        const text = await ppt.readPresentationText(fileId);
        return { httpStatus: 200, response: { fileId, chars: text.length } };
      }
      if (!ctx.allowWrites) {
        throw new Error("microsoft-powerpoint-read-presentation requires a fileId in credentials or --writes to create+read+keep a labeled deck");
      }
      const created = await ppt.createPresentation(label(), [{ title: "Phase7", body: "verification" }]);
      if (!created?.id) throw new Error("Microsoft PowerPoint: create returned no id");
      const text = await ppt.readPresentationText(created.id);
      return { httpStatus: 200, response: { fileId: created.id, chars: text.length, kept: true } };
    }
    /* ── microsoft-powerpoint: automate ── */
    case "microsoft-powerpoint-create-presentation": {
      if (!ctx.allowWrites) throw new Error("microsoft-powerpoint-create-presentation requires --writes (creates a labeled deck and leaves it in place)");
      const ppt = createPowerPointClient(baseAuth(cred, "microsoft-powerpoint", ctx) as never);
      const created = await ppt.createPresentation(label(), [
        { title: "Phase7", body: "verification" },
        { title: "Slide two", body: "payload" },
      ]);
      if (!created?.id) throw new Error("Microsoft PowerPoint: create returned no id");
      const text = await ppt.readPresentationText(created.id);
      return { httpStatus: 200, response: { fileId: created.id, chars: text.length, roundTrip: text.includes("Slide two"), kept: true } };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};

// Adapters are keyed by provider in adapters/index.ts — but Microsoft provider
// ids are distinct, so ensure every provider id that shares this adapter is
// mapped there. This marker keeps the mapping auditable in one place.
export const microsoftAdapterProviders = ["onedrive", "microsoft-word", "microsoft-excel", "microsoft-powerpoint"];
