/**
 * durable-stores.ts — SLICE 144. ONE list of every durable store we hold.
 *
 * WHY THIS EXISTS (owner directive 2026-10-30: "All clients need their data
 * secured."): a backup that silently misses a store is worse than no backup,
 * because it looks like protection. Until this file there was no single place
 * that said what "all our data" actually is — the store names were scattered
 * across 40 `src/native/*`type modules, the `src/lib` stores and prod-server.ts.
 *
 * HOW THE LIST IS DERIVED: mechanically, from the source, not by hand-counting:
 *   - every `_KEY` constant in `src/native/+/types.ts` (92 native stores);
 *   - every store-path constant / `join(dataDir, "<name>.json")` in `src/lib`
 *     and `src/verification`;
 *   - every `join(DATA_DIR, "<name>.json")` in prod-server.ts;
 *   - the three binary trees the app writes outside JSON (vault blobs, native
 *     documents, form uploads).
 * `deriveDeclaredStores()` in `scripts/lib/backup-core.ts` re-runs that
 * derivation against a source tree, and
 * `src/test/durability-144.test.ts` fails if a store exists in the source but is
 * missing from this list. So adding a store and forgetting to register it here
 * is a RED TEST, and an unregistered store also fails the backup run itself
 * (the coverage assertion) rather than being silently skipped.
 *
 * DELIBERATELY ABSENT: `backup_status.json` (operational status of the backup,
 * rewritten every run, excluded from every archive) and the runtime ownership
 * locks (`prod-server.lock`, `liveness-watchdog.lock`) — restoring a lock blocks
 * boot. None of those hold customer data.
 */

/** Every durable store this server can write, relative to DATA_DIR. */
export const DURABLE_STORES: readonly string[] = [
  "accessreview_audit.json",
  "accessreview_campaigns.json",
  "accessreview_evidence.json",
  "accessreview_items.json",
  "accessreview_pending.json",
  "assistant_audit.json",
  "assistant_messages.json",
  "chat_sessions.json",
  "client_files.json",
  "dedupe_audit.json",
  "dedupe_identities.json",
  "dedupe_match_rules.json",
  "dedupe_pending.json",
  "dedupe_quality_rules.json",
  "dedupe_runs.json",
  "dedupe_suggestions.json",
  "file_import_audit.json",
  "file_import_jobs.json",
  "file_import_pending.json",
  "file_import_rows.json",
  "firm_memory.json",
  "import_audit.json",
  "import_jobs.json",
  "import_pending.json",
  "import_runs.json",
  "import_staging.json",
  "integrations.json",
  "knowledgebase_articles.json",
  "knowledgebase_audit.json",
  "knowledgebase_categories.json",
  "knowledgebase_drafts.json",
  "knowledgebase_pending.json",
  "lead_notifications.json",
  "leads.json",
  "native_automation_audit.json",
  "native_automation_pending.json",
  "native_automation_rules.json",
  "native_automation_runs.json",
  "native_boards.json",
  "native_boards_audit.json",
  "native_booking_slugs.json",
  "native_bookings.json",
  "native_bookings_audit.json",
  "native_checklists.json",
  "native_checklists_audit.json",
  "native_communications_audit.json",
  "native_communications_messages.json",
  "native_communications_pending.json",
  "native_dashboard_alert_records.json",
  "native_dashboard_alert_rules.json",
  "native_dashboard_audit.json",
  "native_dashboard_pending.json",
  "native_dashboard_reports.json",
  "native_dashboard_runs.json",
  "native_dashboard_schedules.json",
  "native_dashboards.json",
  "native_dealroom_slugs.json",
  "native_dealrooms.json",
  "native_dealrooms_audit.json",
  "native_docs",
  "native_documents.json",
  "native_documents_audit.json",
  "native_extract_audit.json",
  "native_extract_pending.json",
  "native_forms",
  "native_forms.json",
  "native_forms_audit.json",
  "native_forms_slugs.json",
  "native_invoice_slugs.json",
  "native_invoice_webhook_events.json",
  "native_invoice_webhook_tokens.json",
  "native_invoices.json",
  "native_invoices_audit.json",
  "native_proposal_slugs.json",
  "native_proposals.json",
  "native_proposals_audit.json",
  "native_stripe_connect.json",
  "native_survey_audit.json",
  "native_survey_pending.json",
  "native_survey_responses.json",
  "native_surveys.json",
  "native_tables.json",
  "native_tables_audit.json",
  "native_transform_audit.json",
  "native_transform_pending.json",
  "native_transform_runs.json",
  "native_transforms.json",
  "native_webhook_audit.json",
  "native_webhook_deliveries.json",
  "native_webhook_receipts.json",
  "native_webhook_seen.json",
  "native_webhook_sinks.json",
  "native_webhook_subscriptions.json",
  "oauth_states.json",
  "password_resets.json",
  "pending_emails.json",
  "retrieval_index.json",
  "sales_events.json",
  "sessions.json",
  "subscription_events.json",
  "tenant_approvals.json",
  "tenant_audit_logs.json",
  "tenant_autonomy.json",
  "tenant_autonomy_audit.json",
  "tenant_communications.json",
  "tenant_documents.json",
  "tenant_industries.json",
  "tenant_integrations.json",
  "tenant_knowledge_base.json",
  "tenant_oauth_credentials.json",
  "tenant_payment_methods.json",
  "tenant_purchases.json",
  "tenant_reports.json",
  "tenant_settings.json",
  "tenant_subscriptions.json",
  "tenant_tasks.json",
  "tenant_training.json",
  "tenant_vault_templates.json",
  "tenant_workflows.json",
  "transport_audit.json",
  "transport_connections.json",
  "transport_keys.json",
  "transport_pending.json",
  "transport_rules.json",
  "transport_runs.json",
  "users.json",
  "vault/blobs",
  "vault_audit.json",
  "vault_folders.json",
  "vault_index.json",
  "verification_evidence.json",
  "workflow_runs.json",
];

/** Directory-backed stores (bytes, not JSON) — subset of DURABLE_STORES. */
export const DURABLE_BINARY_STORES: readonly string[] = ["native_docs", "native_forms", "vault/blobs"];

/** True when `store` is a directory tree rather than a single file. */
export function isDirectoryStore(store: string): boolean {
  return DURABLE_BINARY_STORES.includes(store);
}
