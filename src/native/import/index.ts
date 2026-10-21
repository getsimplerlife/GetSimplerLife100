/**
 * native/import/index.ts — Phase 5.1 (6.1) native IMPORT / MIGRATION slice
 * (client-optional import lanes, owner 10-20 direction). Barrel.
 *
 * Every mutation rides the Approval Queue verb-first (createImport /
 * updateImport / deleteImport / pullImportData / mapImportFields /
 * commitImport): `pull`, `map`, `commit` are ADDED to WRITE_VERB by this
 * slice — without them these verb-first actions classify as READS and BYPASS
 * the Queue (the standing fail-open guard). COMMIT is precedent-locked: the
 * mapped rows are staged in THIS tenant-keyed store and committed THROUGH the
 * tables slice's existing gated `importTableRows` write (ONE approval card —
 * no double-queue, no cross-store writes). The run ledger is honest only:
 * pulled/mapped/skipped/committed/failed as they happened; pull on a lane
 * with no wired source reports 0 pulled rather than fabricating a count.
 */
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "./router";
import {
  submitImportWrite,
  executePendingImportWrite,
  rejectImportWrite,
  noteOwnerDecision,
  registerImportSource,
  hasImportSource,
  getActionName,
  KNOWN_IMPORT_PROVIDERS,
  publicJob,
  publicRun,
  publicWrite,
} from "./gate";
import {
  listJobs,
  getJob,
  listRuns,
  listAudit,
  listPendingWrites,
  getStaging,
  generateImportEntityId,
} from "./store";
import {
  NATIVE_IMPORT_JOBS_KEY,
  NATIVE_IMPORT_STAGING_KEY,
  NATIVE_IMPORT_PENDING_KEY,
  NATIVE_IMPORT_RUNS_KEY,
  NATIVE_IMPORT_AUDIT_KEY,
  MAX_IMPORT_RUNS_PER_TENANT,
  MAX_STAGING_ROWS,
  MAX_IMPORT_BYTES,
  MAX_MAPPING_FIELDS,
  MAX_PENDING_IMPORT_WRITES,
  MAX_PULL_ATTEMPTS_PER_DAY,
  MAX_PAGE_SIZE,
} from "./types";
export {
  registerXeroImportSource,
  makeXeroImportSourceReader,
  XeroImportSourceError,
} from "./xero-source";
export {
  registerHubSpotImportSource,
  makeHubSpotImportSourceReader,
  HubSpotImportSourceError,
} from "./hubspot-source";
export {
  registerOneDriveImportSource,
  makeOneDriveImportSourceReader,
  OneDriveImportSourceError,
} from "./onedrive-source";
export {
  registerSftpImportSource,
  makeSftpImportSourceReader,
  SftpImportSourceError,
} from "./sftp-source";
export {
  registerGoogleDriveImportSource,
  makeGoogleDriveImportSourceReader,
  GoogleDriveImportSourceError,
} from "./google-drive-source";
export {
  handleNativeImportAuthed,
  registerBuiltinNativeImportEventTypes,
  submitImportWrite,
  executePendingImportWrite,
  rejectImportWrite,
  noteOwnerDecision,
  registerImportSource,
  hasImportSource,
  getActionName,
  KNOWN_IMPORT_PROVIDERS,
  publicJob,
  publicRun,
  publicWrite,
  listJobs,
  getJob,
  listRuns,
  listAudit,
  listPendingWrites,
  getStaging,
  generateImportEntityId,
  NATIVE_IMPORT_JOBS_KEY,
  NATIVE_IMPORT_STAGING_KEY,
  NATIVE_IMPORT_PENDING_KEY,
  NATIVE_IMPORT_RUNS_KEY,
  NATIVE_IMPORT_AUDIT_KEY,
  MAX_IMPORT_RUNS_PER_TENANT,
  MAX_STAGING_ROWS,
  MAX_IMPORT_BYTES,
  MAX_MAPPING_FIELDS,
  MAX_PENDING_IMPORT_WRITES,
  MAX_PULL_ATTEMPTS_PER_DAY,
  MAX_PAGE_SIZE,
};
export type { NativeImportCtx } from "./router";