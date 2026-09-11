/**
 * vault/actions.ts — NATIVE vault write executors for the engine Action
 * Registry (provider id "vault", no external connection required).
 *
 * WHY THIS FILE EXISTS (fix for the 09-10 live smoke finding):
 *   The vault-filing gate (#164/#235) stores pending actions under the names
 *   writeVaultDocument / moveVaultDocument / archiveVaultDocument /
 *   restoreVaultDocument / deleteVaultDocument / updateVaultDocument, but
 *   those names were never registered in the engine action registry. When a
 *   human approved such an action in the portal, executeAction() answered
 *   "Unknown action" and the write NEVER happened (the decision was durably
 *   recorded, the write silently did not). This module registers those names
 *   as NATIVE actions:
 *     - native: the executor skips the provider-connection lookup (vault has
 *       no OAuth connection; the tenant *is* the user) and passes a context
 *       object { tenantId, dataDir } instead of a ConnectionConfig.
 *     - bypassApproval on every write: authority was ALREADY granted by the
 *       executor's Approval Queue gate (either the human approved the exact
 *       stored payload, or an autonomy allow-list entry allowed it). The
 *       executor is the ONLY caller of these handlers, and it never reaches
 *       the handler unless authority was granted — so re-gating here would
 *       double-queue every approved write. Fail-closed is preserved: any
 *       other entry point (e.g. POST /api/vault/file) still calls the
 *       vault-filing functions directly WITHOUT this flag and remains gated.
 *
 * Every handler still: resolves the document per-tenant (unknown ids fail
 * closed), writes durably, and appends to the immutable vault audit.
 */
import type { ActionDefinition } from "../../../engine/action-executor";
import {
  archiveDocument,
  destroyDocument,
  fileDocument,
  moveDocument,
  unarchiveDocument,
  updateDocumentMeta,
  VAULT_ACTIONS,
} from "../../../lib/vault-filing";

/** Context the executor injects for native (connection-less) actions. */
export interface NativeActionContext {
  tenantId: string;
  dataDir: string;
}

const ctx = (config: unknown): NativeActionContext => config as NativeActionContext;

export const vaultActions: ActionDefinition[] = [
  {
    name: VAULT_ACTIONS.file,
    description:
      "File a vault document to a canonical route (approval-gated; executes only after a human approves the exact stored payload or an autonomy allow-list entry allows it).",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Exact vault document id" },
        route: { type: "string", description: "Canonical route, e.g. Acme/Invoices/2026" },
      },
      required: ["documentId", "route"],
    },
    handler: async (config: any, params: Record<string, any>) => {
      const { tenantId, dataDir } = ctx(config);
      return fileDocument({
        tenantId,
        documentId: String(params.documentId),
        route: String(params.route),
        actor: `${tenantId}/portal`,
        dataDir,
        bypassApproval: true,
      });
    },
  },
  {
    name: VAULT_ACTIONS.move,
    description:
      "Re-route an existing vault document to a new canonical route (approval-gated, idempotent, audited).",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        route: { type: "string" },
      },
      required: ["documentId", "route"],
    },
    handler: async (config: any, params: Record<string, any>) => {
      const { tenantId, dataDir } = ctx(config);
      return moveDocument({
        tenantId,
        documentId: String(params.documentId),
        route: String(params.route),
        actor: `${tenantId}/portal`,
        dataDir,
        bypassApproval: true,
      });
    },
  },
  {
    name: VAULT_ACTIONS.archive,
    description:
      "Transition a vault document to archived (approval-gated; restore available).",
    inputSchema: {
      type: "object",
      properties: { documentId: { type: "string" } },
      required: ["documentId"],
    },
    handler: async (config: any, params: Record<string, any>) => {
      const { tenantId, dataDir } = ctx(config);
      return archiveDocument({
        tenantId,
        documentId: String(params.documentId),
        actor: `${tenantId}/portal`,
        dataDir,
        bypassApproval: true,
      });
    },
  },
  {
    name: VAULT_ACTIONS.unarchive,
    description: "Restore an archived vault document to active (approval-gated).",
    inputSchema: {
      type: "object",
      properties: { documentId: { type: "string" } },
      required: ["documentId"],
    },
    handler: async (config: any, params: Record<string, any>) => {
      const { tenantId, dataDir } = ctx(config);
      return unarchiveDocument({
        tenantId,
        documentId: String(params.documentId),
        actor: `${tenantId}/portal`,
        dataDir,
        bypassApproval: true,
      });
    },
  },
  {
    name: VAULT_ACTIONS.destroy,
    description:
      "Destroy exactly ONE known vault document (exact id, never glob). Re-destroying an already-destroyed exact id is an audited success no-op; unknown ids fail closed.",
    inputSchema: {
      type: "object",
      properties: { documentId: { type: "string" } },
      required: ["documentId"],
    },
    handler: async (config: any, params: Record<string, any>) => {
      const { tenantId, dataDir } = ctx(config);
      return destroyDocument({
        tenantId,
        documentId: String(params.documentId),
        actor: `${tenantId}/portal`,
        dataDir,
        bypassApproval: true,
      });
    },
  },
  {
    name: VAULT_ACTIONS.update,
    description:
      "Update vault document metadata (tags / retention / docType / customer / project) — approval-gated, audited.",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        retention: { type: "object" },
        docType: { type: "string" },
        customer: { type: "string" },
        project: { type: "string" },
      },
      required: ["documentId"],
    },
    handler: async (config: any, params: Record<string, any>) => {
      const { tenantId, dataDir } = ctx(config);
      return updateDocumentMeta({
        tenantId,
        documentId: String(params.documentId),
        actor: `${tenantId}/portal`,
        dataDir,
        bypassApproval: true,
        tags: Array.isArray(params.tags) ? params.tags.map(String) : undefined,
        retention: params.retention && typeof params.retention === "object" ? params.retention : undefined,
        docType: params.docType !== undefined ? String(params.docType) : undefined,
        customer: params.customer !== undefined ? String(params.customer) : undefined,
        project: params.project !== undefined ? String(params.project) : undefined,
      });
    },
  },
];