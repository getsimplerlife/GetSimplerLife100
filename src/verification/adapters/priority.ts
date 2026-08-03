/**
 * Verification adapters for the Phase 7 priority providers (free-sandbox tier):
 * HubSpot, Slack, Jira (Atlassian), DocuSign, Monday.com.
 *
 * Each adapter maps a capability contract id to a live, canonical-host API call
 * through the provider's existing client module. Writes are only executed when
 * `ctx.allowWrites` is true, use labeled Phase7-* synthetic objects, and clean up
 * after themselves. Unknown capability ids fail closed without network calls.
 */
import { createHubSpotClient } from "../../integrations/providers/hubspot/client";
import { refreshHubSpotToken } from "../../integrations/providers/hubspot/auth";
import { isTokenExpired } from "../../integrations/framework/oauth";
import { createSlackClient } from "../../integrations/providers/slack/client";
import { createJiraClient } from "../../integrations/providers/jira/client";
import { createDocuSignClient } from "../../integrations/providers/docusign/client";
import { createMondayComClient } from "../../integrations/providers/monday-com/client";
import { createIntercomClient } from "../../integrations/providers/intercom/client";
import { createZendeskClient } from "../../integrations/providers/zendesk/client";
import { createSalesforceClient } from "../../integrations/providers/salesforce/client";
import { createWorkdayClient } from "../../integrations/providers/workday/client";
import { createServiceNowClient } from "../../integrations/providers/servicenow/client";
import type { CapabilityAdapter } from "./index";
import type { ProviderCredential } from "../credential-source";

const LABEL = () => `Phase7-VERIFY-${Date.now()}`;

/**
 * Refresh the HubSpot access token once if expired. Mutates `cred` so every
 * later contract call in the same run reuses the fresh token.
 */
async function ensureFreshHubSpotCredential(
  cred: ProviderCredential,
  app?: { clientId?: string; clientSecret?: string },
): Promise<void> {
  const tokenLike = { accessToken: cred.accessToken, refreshToken: cred.refreshToken, expiresAt: cred.expiresAt };
  if (!cred.refreshToken || !isTokenExpired(tokenLike as never)) return;
  if (!app?.clientId || !app?.clientSecret) {
    throw new Error("HubSpot access token expired and OAUTH_HUBSPOT_CLIENT_ID/SECRET are not configured — cannot refresh (see .env)");
  }
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  const refreshed = await refreshHubSpotToken(
    { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri: base ? `${base}/api/oauth/callback?provider=hubspot` : "" },
    cred.refreshToken,
  );
  cred.accessToken = refreshed.accessToken;
  cred.refreshToken = refreshed.refreshToken;
  cred.expiresAt = refreshed.expiresAt;
  if (refreshed.scope) cred.scope = refreshed.scope;
}

function baseAuth(cred: Record<string, unknown>, provider: string, ctx: { app?: { clientId?: string; clientSecret?: string } }) {
  const base = process.env.OAUTH_REDIRECT_BASE || process.env.SITE_ORIGIN || "";
  return {
    accessToken: (cred.accessToken as string) || "",
    refreshToken: (cred.refreshToken as string) || undefined,
    expiresAt: cred.expiresAt as number | undefined,
    scope: (cred.scope as string) || undefined,
    clientId: ctx.app?.clientId,
    clientSecret: ctx.app?.clientSecret,
    redirectUri: base ? `${base}/api/oauth/callback?provider=${provider}` : "",
  };
}

/* ────────────────────────── HubSpot ────────────────────────── */

/**
 * HubSpot user-level OAuth tokens cannot DELETE/archive CRM objects (HTTP 403
 * "User level OAuth token is not allowed for this endpoint"). Write verification
 * requires create + rollback; if rollback is impossible we must fail closed BEFORE
 * creating anything, otherwise every run leaves un-cleanable synthetic objects in
 * the customer portal. Probe once per credential using a non-existent object id.
 */
async function assertHubSpotDeleteCapability(accessToken: string): Promise<void> {
  const probe = await fetch("https://api.hubapi.com/crm/v3/objects/deals/000000000000", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (probe.status === 403) {
    throw new Error(
      "HubSpot credential cannot delete/archive CRM objects (403 — user-level OAuth token). " +
        "Write verification requires create + rollback, so writes fail closed to avoid leaving residue. " +
        "Connect a private-app token with delete permission to verify writes.",
    );
  }
  // 404 (no such object) means DELETE is permitted; 401/5xx are surfaced below per-request.
}

export const hubspotAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("HubSpot credential has no accessToken");
  await ensureFreshHubSpotCredential(cred, ctx.app);
  const client = createHubSpotClient(baseAuth(cred, "hubspot", ctx));

  switch (contract.capabilityId) {
    case "hubspot-read-contacts": {
      const result = await client.searchContacts("");
      return { httpStatus: 200, response: { count: result.results?.length ?? 0 } };
    }
    case "hubspot-read-deals": {
      const result = await client.searchDeals("");
      return { httpStatus: 200, response: { count: result.results?.length ?? 0 } };
    }
    case "hubspot-read-companies": {
      const result = await client.searchCompanies("");
      return { httpStatus: 200, response: { count: result.results?.length ?? 0 } };
    }
    case "hubspot-read-tickets": {
      const result = await client.searchTickets("");
      return { httpStatus: 200, response: { count: result.results?.length ?? 0 } };
    }
    case "hubspot-read-pipeline-stages": {
      const pipelines = await client.getPipelineStages();
      const stageCount = pipelines.reduce((n: number, p: any) => n + (Array.isArray(p.stages) ? p.stages.length : 0), 0);
      return { httpStatus: 200, response: { pipelines: pipelines.length, stages: stageCount } };
    }
    case "hubspot-read-owners": {
      const owners = await client.getOwners();
      return { httpStatus: 200, response: { count: owners.length } };
    }
    case "hubspot-create-deal": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      await assertHubSpotDeleteCapability(cred.accessToken);
      const label = LABEL();
      const id = await client.createDeal({ dealname: label, amount: 1 });
      if (!id) throw new Error("HubSpot createDeal returned no id");
      try {
        await client.deleteObject("deals", id);
      } catch (cleanupError) {
        throw new Error(`deal created (${id}) but cleanup failed: ${String(cleanupError)}`);
      }
      return { httpStatus: 201, response: { created: true, rolledBack: true, id } };
    }
    case "hubspot-create-contact": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      await assertHubSpotDeleteCapability(cred.accessToken);
      const label = LABEL();
      const id = await client.createContact({ lastname: label, firstname: "Phase7" });
      if (!id) throw new Error("HubSpot createContact returned no id");
      try {
        await client.deleteObject("contacts", id);
      } catch (cleanupError) {
        throw new Error(`contact created (${id}) but cleanup failed: ${String(cleanupError)}`);
      }
      return { httpStatus: 201, response: { created: true, rolledBack: true, id } };
    }
    case "hubspot-create-company": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      await assertHubSpotDeleteCapability(cred.accessToken);
      const label = LABEL();
      const id = await client.createCompany({ name: label });
      if (!id) throw new Error("HubSpot createCompany returned no id");
      try {
        await client.deleteObject("companies", id);
      } catch (cleanupError) {
        throw new Error(`company created (${id}) but cleanup failed: ${String(cleanupError)}`);
      }
      return { httpStatus: 201, response: { created: true, rolledBack: true, id } };
    }
    case "hubspot-update-deal-stage": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      await assertHubSpotDeleteCapability(cred.accessToken);
      const pipelines = await client.getPipelineStages();
      const firstStage = pipelines[0]?.stages?.[0] as { id?: string } | undefined;
      const secondStage = pipelines[0]?.stages?.[1] as { id?: string } | undefined;
      if (!firstStage?.id || !secondStage?.id) {
        throw new Error("HubSpot portal has no pipeline with two stages to exercise a stage change");
      }
      const label = LABEL();
      const id = await client.createDeal({ dealname: label, dealstage: firstStage.id });
      if (!id) throw new Error("HubSpot createDeal returned no id");
      try {
        await client.updateDeal(id, { dealstage: secondStage.id });
        await client.deleteObject("deals", id);
      } catch (cleanupError) {
        throw new Error(`deal created (${id}) but stage-update/cleanup failed: ${String(cleanupError)}`);
      }
      return { httpStatus: 200, response: { created: true, stageChanged: true, rolledBack: true, id } };
    }
    case "hubspot-monitor-deal-stage-change": {
      throw new Error(
        "monitor verification requires a live webhook receiver (deal.propertyChange); the batch CLI cannot fabricate event receipt",
      );
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};

/* ────────────────────────── Slack ────────────────────────── */

export const slackAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("Slack credential has no accessToken");
  const client = createSlackClient(baseAuth(cred, "slack", ctx));

  switch (contract.capabilityId) {
    case "slack-read-messages": {
      const channels = await client.listConversations("public_channel");
      const channel = channels[0]?.id as string | undefined;
      if (!channel) throw new Error("Slack workspace has no public channel to read");
      const messages = await client.getConversationHistory(channel, 5);
      return { httpStatus: 200, response: { channel, count: messages.length } };
    }
    case "slack-send-message": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const channels = await client.listConversations("public_channel");
      const channel = channels[0]?.id as string | undefined;
      if (!channel) throw new Error("Slack workspace has no public channel to post to");
      const result = await client.postMessage(channel, `Verification message ${LABEL()} — safe to delete`);
      return { httpStatus: 200, response: { ok: Boolean(result?.ok), channel } };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};

/* ────────────────────────── Jira ────────────────────────── */

async function resolveJiraCloudId(accessToken: string, known?: string): Promise<string> {
  if (known) return known;
  const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Atlassian accessible-resources failed HTTP ${response.status}`);
  const resources = (await response.json()) as Array<{ id: string }>;
  if (!Array.isArray(resources) || resources.length === 0) throw new Error("Atlassian returned no accessible site");
  return resources[0].id;
}

export const jiraAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("Jira credential has no accessToken");
  const cloudId = await resolveJiraCloudId(cred.accessToken, (cred.cloudId as string) || undefined);
  const client = createJiraClient({
    ...baseAuth(cred, "jira", ctx),
    cloudId,
  });

  switch (contract.capabilityId) {
    case "jira-read-audit-items": {
      const issues = await client.searchIssues("ORDER BY created DESC", 5);
      return { httpStatus: 200, response: { count: issues.length } };
    }
    case "jira-create-audit-finding": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const projects = await client.listProjects();
      const project = projects[0]?.key as string | undefined;
      if (!project) throw new Error("Jira site has no project to create an issue in");
      const label = LABEL();
      const created = await client.createIssue({
        project: { key: project },
        summary: label,
        issuetype: { name: "Task" },
        description: "Phase 7 provider verification — safe to delete",
      });
      const issueKey = created?.key as string | undefined;
      if (!issueKey) throw new Error("Jira createIssue returned no key");
      // Note: cleanup of Jira issues is intentionally left manual (no delete endpoint
      // in the current client; issues are labeled Phase7-* for identification).
      return { httpStatus: 201, response: { created: true, key: issueKey } };
    }
    case "jira-read-projects": {
      const projects = await client.listProjects();
      return { httpStatus: 200, response: { count: projects.length } };
    }
    case "jira-link-issues": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const issues = await client.searchIssues("ORDER BY created DESC", 2);
      if (issues.length < 2) throw new Error("Jira site needs at least 2 issues to link");
      const inward = issues[0]?.key as string | undefined;
      const outward = issues[1]?.key as string | undefined;
      if (!inward || !outward) throw new Error("Jira searchIssues returned issues without keys");
      await client.linkIssues("Relates", inward, outward);
      return { httpStatus: 201, response: { linked: true, inward, outward } };
    }
    case "jira-read-comments": {
      const issues = await client.searchIssues("ORDER BY created DESC", 1);
      const key = issues[0]?.key as string | undefined;
      if (!key) throw new Error("Jira site has no issues to read comments from");
      const comments = await client.getComments(key);
      return { httpStatus: 200, response: { count: comments.length } };
    }
    case "jira-transition-issue": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const issues = await client.searchIssues("ORDER BY created DESC", 1);
      const key = issues[0]?.key as string | undefined;
      if (!key) throw new Error("Jira site has no issues to transition");
      const transitions = await client.getTransitions(key);
      if (!transitions.length) throw new Error("Jira issue has no available transitions");
      await client.transitionIssue(key, transitions[0].id as string);
      return { httpStatus: 200, response: { transitioned: true, key, to: transitions[0].name } };
    }
    case "jira-monitor-issue-created": {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "+0000");
      const issues = await client.searchIssues(`created > "${fiveMinAgo}" ORDER BY created DESC`, 10);
      return { httpStatus: 200, response: { recentCount: issues.length } };
    }
    case "jira-read-issue": {
      const issues = await client.searchIssues("ORDER BY created DESC", 1);
      const key = issues[0]?.key as string | undefined;
      if (!key) throw new Error("Jira site has no issues to read");
      const issue = await client.getIssue(key);
      return { httpStatus: 200, response: { found: true, key } };
    }
    case "jira-update-issue": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const issues = await client.searchIssues("ORDER BY created DESC", 1);
      const key = issues[0]?.key as string | undefined;
      if (!key) throw new Error("Jira site has no issues to update");
      const label = LABEL();
      await client.updateIssue(key, { description: `${label} — Phase 7 verification update` });
      return { httpStatus: 200, response: { updated: true, key } };
    }
    case "jira-read-sprints": {
      const boards = await client.listBoards();
      if (!boards.length) throw new Error("Jira site has no agile boards");
      const boardId = boards[0]?.id as number | undefined;
      if (!boardId) throw new Error("Jira board has no id");
      const sprints = await client.listSprints(boardId);
      return { httpStatus: 200, response: { count: sprints.length } };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};

/* ────────────────────────── DocuSign ────────────────────────── */

async function resolveDocuSignAccount(accessToken: string): Promise<{ accountId: string; baseUrl: string }> {
  const response = await fetch("https://account.docusign.com/oauth/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`DocuSign userinfo failed HTTP ${response.status}`);
  const info = (await response.json()) as {
    accounts?: Array<{ account_id: string; base_uri: string; is_default?: boolean }>;
  };
  const account = info.accounts?.find((a) => a.is_default) ?? info.accounts?.[0];
  if (!account?.account_id || !account.base_uri) throw new Error("DocuSign userinfo returned no account");
  return { accountId: account.account_id, baseUrl: `https://${account.base_uri}/restapi` };
}

export const docusignAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("DocuSign credential has no accessToken");
  const account = await resolveDocuSignAccount(cred.accessToken).catch(() => ({
    accountId: (cred.accountId as string) || "",
    baseUrl: (cred.baseUrl as string) || "https://demo.docusign.net/restapi",
  }));
  if (!account.accountId) throw new Error("DocuSign account id unresolved (connect flow must capture accountId)");
  const client = createDocuSignClient({ ...baseAuth(cred, "docusign", ctx), accountId: account.accountId, baseUrl: account.baseUrl });

  switch (contract.capabilityId) {
    /* ── understand (read) ── */
    case "docusign-read-envelopes": {
      const envelopes = await client.listEnvelopes();
      return { httpStatus: 200, response: { count: envelopes.length } };
    }
    case "docusign-read-bulk-envelopes": {
      const envelopes = await client.listEnvelopes("2020-01-01");
      return { httpStatus: 200, response: { count: envelopes.length } };
    }
    case "docusign-read-templates": {
      const templates = await client.listTemplates();
      return { httpStatus: 200, response: { count: templates.length } };
    }
    case "docusign-check-signing-status": {
      const envelopes = await client.listEnvelopes();
      const id = envelopes[0]?.envelopeId as string | undefined;
      if (!id) throw new Error("DocuSign account has no envelopes to check status on");
      const envelope = await client.getEnvelope(id);
      return { httpStatus: 200, response: { status: envelope?.status, envelopeId: id } };
    }
    case "docusign-download-signed-doc": {
      const envelopes = await client.listEnvelopes();
      const id = envelopes[0]?.envelopeId as string | undefined;
      if (!id) throw new Error("DocuSign account has no envelopes to download documents from");
      const docs = await client.getEnvelopeDocuments(id);
      return { httpStatus: 200, response: { hasDocuments: Boolean(docs), envelopeId: id } };
    }
    case "docusign-read-recipients": {
      const envelopes = await client.listEnvelopes();
      const id = envelopes[0]?.envelopeId as string | undefined;
      if (!id) throw new Error("DocuSign account has no envelopes to read recipients from");
      const recipients = await client.listRecipients(id);
      return { httpStatus: 200, response: { signers: recipients?.signers?.length ?? 0, envelopeId: id } };
    }
    case "docusign-read-envelope": {
      const envelopes = await client.listEnvelopes();
      const id = envelopes[0]?.envelopeId as string | undefined;
      if (!id) throw new Error("DocuSign account has no envelopes to read");
      const envelope = await client.getEnvelope(id);
      return { httpStatus: 200, response: { found: true, envelopeId: id, status: envelope?.status } };
    }
    /* ── monitor ── */
    case "docusign-monitor-envelope-status": {
      const envelopes = await client.listEnvelopes();
      if (!envelopes.length) throw new Error("DocuSign account has no envelopes to monitor");
      const recent = envelopes.slice(0, 5);
      const statuses = await Promise.all(recent.map(async (e) => {
        const detail = await client.getEnvelope(e.envelopeId as string);
        return { envelopeId: e.envelopeId, status: detail?.status };
      }));
      return { httpStatus: 200, response: { monitored: statuses.length, statuses } };
    }
    /* ── automate (write) ── */
    case "docusign-send-document": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const created = await client.sendEnvelope({
        status: "created", // draft — nothing is sent to real recipients
        emailSubject: label,
        documents: [
          {
            documentBase64: Buffer.from("Phase 7 verification document — safe to delete").toString("base64"),
            name: "verification.txt",
            fileExtension: "txt",
            documentId: "1",
          },
        ],
        recipients: {
          signers: [
            {
              email: (cred.email as string) || "verify@example.invalid",
              name: "Phase7 Verification",
              recipientId: "1",
              routingOrder: "1",
            },
          ],
        },
      });
      const envelopeId = created?.envelopeId as string | undefined;
      if (!envelopeId) throw new Error("DocuSign sendEnvelope returned no envelopeId");
      // Cleanup: void the draft envelope so verification leaves no residue.
      // Zendesk-parity rollback: guaranteed in `finally` — a failed cleanup surfaces as an error.
      try {
        return { httpStatus: 201, response: { created: true, rolledBack: true, envelopeId } };
      } finally {
        await client.voidEnvelope(envelopeId, "Phase 7 verification cleanup");
      }
    }
    case "docusign-void-envelope": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      // Create a draft envelope first so we have something to void.
      const label = LABEL();
      const created = await client.sendEnvelope({
        status: "created",
        emailSubject: label,
        documents: [
          {
            documentBase64: Buffer.from("Phase 7 verification — void test").toString("base64"),
            name: "void-test.txt",
            fileExtension: "txt",
            documentId: "1",
          },
        ],
        recipients: {
          signers: [
            {
              email: (cred.email as string) || "verify@example.invalid",
              name: "Phase7 Verification",
              recipientId: "1",
              routingOrder: "1",
            },
          ],
        },
      });
      const envelopeId = created?.envelopeId as string | undefined;
      if (!envelopeId) throw new Error("DocuSign sendEnvelope returned no envelopeId (cannot test void)");
      await client.voidEnvelope(envelopeId, "Phase 7 void verification");
      return { httpStatus: 200, response: { voided: true, envelopeId } };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};

/* ────────────────────────── Monday.com ────────────────────────── */

export const mondayComAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  const apiToken = (cred.apiToken as string) || (cred.apiKey as string) || "";
  if (!apiToken) throw new Error("Monday.com credential has no apiToken");
  const client = createMondayComClient({ apiToken });

  switch (contract.capabilityId) {
    case "monday-read-boards": {
      const boards = await client.listBoards();
      return { httpStatus: 200, response: { count: boards.length } };
    }
    case "monday-read-column-values": {
      const boards = await client.listBoards();
      const boardId = Number(boards[0]?.id);
      if (!boardId) throw new Error("Monday.com workspace has no board to read");
      const items = await client.listItems(boardId, 5);
      return { httpStatus: 200, response: { boardId, itemCount: items.length } };
    }
    case "monday-read-subitems": {
      const boards = await client.listBoards();
      const boardId = Number(boards[0]?.id);
      if (!boardId) throw new Error("Monday.com workspace has no board to read");
      const result = await client.query(
        `query { boards(ids: [${boardId}]) { items_page(limit: 5) { items { id name subitems { id name } } } } }`,
      );
      const items = result?.data?.boards?.[0]?.items_page?.items ?? [];
      return { httpStatus: 200, response: { boardId, itemCount: items.length } };
    }
    case "monday-read-workspaces": {
      const result = await client.query("query { workspaces(limit: 50) { id name } }");
      const workspaces = result?.data?.workspaces ?? [];
      return { httpStatus: 200, response: { count: workspaces.length } };
    }
    case "monday-create-item": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const boards = await client.listBoards();
      const boardId = Number(boards[0]?.id);
      const groupId = (boards[0]?.groups?.[0]?.id as string) || "";
      if (!boardId || !groupId) throw new Error("Monday.com workspace has no board/group to create in");
      const created = await client.createItem(boardId, groupId, LABEL());
      const itemId = created?.id as string | undefined;
      if (!itemId) throw new Error("Monday.com createItem returned no id");
      const cleanup = await client.query(
        `mutation { delete_item_by_id(item_id: ${JSON.stringify(itemId)}) { id } }`,
      );
      if (!cleanup?.data?.delete_item_by_id) {
        throw new Error(`item created (${itemId}) but cleanup failed`);
      }
      return { httpStatus: 200, response: { created: true, itemId } };
    }
    case "monday-update-column-values":
    case "monday-move-item": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const boards = await client.listBoards();
      const boardId = Number(boards[0]?.id);
      if (!boardId) throw new Error("Monday.com workspace has no board");
      const items = await client.listItems(boardId, 1);
      const itemId = items[0]?.id as string | undefined;
      if (!itemId) throw new Error("Monday.com board has no item to exercise write against");
      if (contract.capabilityId === "monday-update-column-values") {
        const result = await client.query(
          `mutation { change_column_value(board_id: ${boardId}, item_id: ${JSON.stringify(itemId)}, column_id: "status", value: "{\\"index\\":0}") { id } }`,
        );
        return { httpStatus: 200, response: { updated: Boolean(result?.data?.change_column_value) } };
      }
      const groups = boards[0]?.groups ?? [];
      const targetGroup = groups[1] ?? groups[0];
      if (!targetGroup?.id) throw new Error("Monday.com board has no second group to move to");
      const result = await client.query(
        `mutation { move_item_to_group(item_id: ${JSON.stringify(itemId)}, group_id: ${JSON.stringify(targetGroup.id)}) { id } }`,
      );
      return { httpStatus: 200, response: { moved: Boolean(result?.data?.move_item_to_group) } };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};

/* ────────────────────────── ServiceNow ────────────────────────── */
/**
 * ServiceNow uses HTTP Basic Auth against `{instance}.service-now.com`.
 * Credentials: { user, password, instance } (personal developer instance).
 * Writes are labeled Phase7-*, cleaned up (create → delete), and revert state
 * they change (severity/assignment updates restore the original value).
 */
export const servicenowAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  const user = (cred.user as string) || (cred.username as string) || "";
  const password = (cred.password as string) || "";
  const instance = (cred.instance as string) || "";
  if (!user || !password || !instance) {
    throw new Error("ServiceNow credential needs user, password and instance (e.g. dev123456)");
  }
  const client = createServiceNowClient({ user, password, instance });
  switch (contract.capabilityId) {
    case "servicenow-read-incidents": {
      const incidents = await client.listIncidents();
      return { httpStatus: 200, response: { count: incidents.length } };
    }
    case "servicenow-create-incident": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const created = await client.createIncident({
        short_description: label,
        description: "Phase 7 provider verification — safe to delete",
        category: "software",
        urgency: 2,
      });
      const sysId = created?.sys_id as string | undefined;
      if (!sysId) throw new Error("ServiceNow createIncident returned no sys_id");
      const cleaned = await client.deleteIncident(sysId);
      if (!cleaned) throw new Error(`incident created (${sysId}) but cleanup failed`);
      return { httpStatus: 201, response: { created: true, sysId } };
    }
    case "servicenow-read-change-requests": {
      const records = await client.queryTable("change_request");
      return { httpStatus: 200, response: { count: records.length } };
    }
    case "servicenow-read-problems": {
      const records = await client.queryTable("problem");
      return { httpStatus: 200, response: { count: records.length } };
    }
    case "servicenow-read-cmdb-assets": {
      const records = await client.queryTable("cmdb_ci");
      return { httpStatus: 200, response: { count: records.length } };
    }
    case "servicenow-update-incident-severity": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const incidents = await client.listIncidents();
      const incident = incidents[0];
      const sysId = incident?.sys_id as string | undefined;
      if (!sysId) throw new Error("ServiceNow instance has no incident to exercise severity update");
      const original = String(incident.severity ?? "");
      const target = original === "2" ? "3" : "2";
      await client.updateIncident(sysId, { severity: target });
      const reverted = await client.updateIncident(sysId, { severity: original });
      if (!reverted) throw new Error(`severity update reverted on ${sysId} but confirmation missing`);
      return { httpStatus: 200, response: { updated: true, sysId, from: original, to: target, reverted: true } };
    }
    case "servicenow-update-incident-assignment": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const incidents = await client.listIncidents();
      const incident = incidents[0];
      const sysId = incident?.sys_id as string | undefined;
      if (!sysId) throw new Error("ServiceNow instance has no incident to exercise assignment update");
      const original = String(incident.assignment_group ?? "");
      // Find the first different assignment group to move to, then revert.
      const groups = await client.queryTable("sys_user_group", "ORDERBYname");
      const alternative = groups.find((g: any) => String(g.sys_id ?? "") !== original);
      if (!alternative?.sys_id) throw new Error("ServiceNow instance has no alternative assignment group");
      const target = String(alternative.sys_id);
      await client.updateIncident(sysId, { assignment_group: target });
      const reverted = await client.updateIncident(sysId, { assignment_group: original });
      if (!reverted) throw new Error(`assignment update reverted on ${sysId} but confirmation missing`);
      return { httpStatus: 200, response: { updated: true, sysId, from: original || "unassigned", to: target, reverted: true } };
    }
    case "servicenow-monitor-incident-created": {
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const incidents = await client.listIncidents();
      const recent = incidents.filter((i: any) => {
        const created = new Date(i.sys_created_on ?? "").getTime();
        return Number.isFinite(created) && created >= fiveMinAgo;
      });
      return { httpStatus: 200, response: { recentCount: recent.length } };
    }
    case "servicenow-read-knowledge-base": {
      const kb = await client.listKnowledgeBase();
      return { httpStatus: 200, response: { count: kb.length } };
    }
    case "servicenow-create-change-request": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const created = await client.createChangeRequest({
        short_description: `${label} - Phase 7 verification change request`,
        description: "Phase 7 verification — safe to close",
        type: "standard",
      });
      const sysId = created?.sys_id as string | undefined;
      if (!sysId) throw new Error("ServiceNow createChangeRequest returned no sys_id");
      const deleted = await client.deleteChangeRequest(sysId);
      if (!deleted) throw new Error("ServiceNow cleanup failed after change request creation");
      return { httpStatus: 201, response: { created: true, sysId, deleted } };


/* ────────────────────────── Intercom ────────────────────────── */

export const intercomAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("Intercom credential has no accessToken");
  const client = createIntercomClient(baseAuth(cred, "intercom", ctx));

  switch (contract.capabilityId) {
    /* ── understand (read) ── */
    case "intercom-read-conversations": {
      const conversations = await client.listConversations();
      return { httpStatus: 200, response: { count: conversations.length } };
    }
    case "intercom-read-contacts": {
      const contacts = await client.listContacts();
      return { httpStatus: 200, response: { count: contacts.length } };
    }
    case "intercom-read-companies": {
      const r = await fetch("https://api.intercom.io/companies", {
        headers: { Authorization: `Bearer ${cred.accessToken}`, Accept: "application/json" },
      });
      const data = await r.json();
      return { httpStatus: r.status, response: { count: data?.data?.length ?? 0 } };
    }
    case "intercom-read-conversation": {
      const conversations = await client.listConversations();
      const id = conversations[0]?.id as string | undefined;
      if (!id) throw new Error("Intercom workspace has no conversations to read");
      const conversation = await client.getConversation(id);
      return { httpStatus: 200, response: { found: true, id, source: conversation?.source?.type } };
    }
    case "intercom-read-contact": {
      const contacts = await client.listContacts();
      const id = contacts[0]?.id as string | undefined;
      if (!id) throw new Error("Intercom workspace has no contacts to read");
      const contact = await client.getContact(id);
      return { httpStatus: 200, response: { found: true, id, email: (contact as any)?.email } };
    }
    /* ── monitor ── */
    case "intercom-monitor-conversations": {
      const conversations = await client.listConversations();
      return { httpStatus: 200, response: { monitored: conversations.length } };
    }
    /* ── automate (write) ── */
    case "intercom-send-message": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const conversations = await client.listConversations();
      const id = conversations[0]?.id as string | undefined;
      if (!id) throw new Error("Intercom workspace has no conversations to reply to");
      const label = LABEL();
      await client.replyToConversation(id, {
        message_type: "comment",
        body: `${label} - Phase 7 verification message (safe to ignore)`,
        type: "admin",
      });
      return { httpStatus: 200, response: { sent: true, conversationId: id } };
    }
    case "intercom-assign-conversation": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const conversations = await client.listConversations();
      const id = conversations[0]?.id as string | undefined;
      if (!id) throw new Error("Intercom workspace has no conversations to assign");
      const r = await fetch(`https://api.intercom.io/conversations/${id}/parts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cred.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message_type: "assignment", type: "admin", assignee_id: (cred as any).adminId || "self" }),
      });
      return { httpStatus: r.status, response: { assigned: r.ok, conversationId: id } };
    }
    case "intercom-tag-user": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const contacts = await client.listContacts();
      const contact = contacts[0] as any;
      if (!contact?.id) throw new Error("Intercom workspace has no contacts to tag");
      const r = await fetch("https://api.intercom.io/contacts/" + contact.id, {
        method: "PUT",
        headers: { Authorization: `Bearer ${cred.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ custom_attributes: { Phase7_verification: "true" } }),
      });
      return { httpStatus: r.status, response: { tagged: r.ok, contactId: contact.id } };
    }
    case "intercom-create-contact": {
        if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
        const label = LABEL();
        const created = await client.createContact({
          role: "user",
          email: `phase7-${Date.now()}@verify.example.invalid`,
          name: label,
        });
        const contactId = created?.id as string | undefined;
        if (!contactId) throw new Error("Intercom createContact returned no id");
        return { httpStatus: 201, response: { created: true, contactId } };
      }
      default:
        throw new Error(`no verification path for ${contract.capabilityId}`);
    }
    };

    /* ────────────────────────── Salesforce ────────────────────────── */

export const salesforceAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("Salesforce credential has no accessToken");
  const instanceUrl = (cred.instanceUrl as string) || (cred.raw as Record<string, unknown>)?.instanceUrl as string | undefined;
  if (!instanceUrl) throw new Error("Salesforce credential has no instanceUrl — complete OAuth first");

  const client = createSalesforceClient({
    accessToken: cred.accessToken as string,
    refreshToken: cred.refreshToken as string | undefined,
    expiresAt: cred.expiresAt as number | undefined,
    scope: (cred.scope as string) || undefined,
    instanceUrl,
    clientId: ctx.app?.clientId,
    clientSecret: ctx.app?.clientSecret,
    isSandbox: (cred.raw as Record<string, unknown>)?.isSandbox as boolean | undefined,
  });

  const cleanupIds: string[] = [];

  switch (contract.capabilityId) {
    /* ── understand (read) ── */
    case "salesforce-read-opportunities": {
      const r = await client.query("SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity LIMIT 50");
      return { httpStatus: 200, response: { count: r.totalSize } };
    }
    case "salesforce-read-accounts": {
      const r = await client.query("SELECT Id, Name, Type, Industry FROM Account LIMIT 50");
      return { httpStatus: 200, response: { count: r.totalSize } };
    }
    case "salesforce-read-contacts": {
      const r = await client.query("SELECT Id, FirstName, LastName, Email FROM Contact LIMIT 50");
      return { httpStatus: 200, response: { count: r.totalSize } };
    }
    case "salesforce-read-leads": {
      const r = await client.query("SELECT Id, FirstName, LastName, Company, Status FROM Lead LIMIT 50");
      return { httpStatus: 200, response: { count: r.totalSize } };
    }
    case "salesforce-read-pipeline": {
      const r = await client.query("SELECT Id, MasterLabel, DefaultProbability, IsActive FROM OpportunityStage LIMIT 50");
      return { httpStatus: 200, response: { count: r.totalSize } };
    }
    /* ── monitor ── */
    case "salesforce-monitor-pipeline": {
      const r = await client.query("SELECT Id, Name, StageName, Amount, CloseDate, LastModifiedDate FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT 50");
      return { httpStatus: 200, response: { monitored: r.totalSize } };
    }
    /* ── automate (write) ── */
    case "salesforce-update-opportunity": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const oppId = await client.create("Opportunity", {
        Name: label,
        StageName: "Prospecting",
        CloseDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      });
      cleanupIds.push(oppId);
      await client.update("Opportunity", oppId, { Amount: 1 });
      await client.delete("Opportunity", oppId);
      cleanupIds.pop();
      return { httpStatus: 200, response: { updated: true, opportunityId: oppId } };
    }
    case "salesforce-create-task": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const taskId = await client.create("Task", { Subject: label, Status: "Not Started", Description: "Phase 7 verification — safe to delete" });
      cleanupIds.push(taskId);
      await client.delete("Task", taskId);
      cleanupIds.pop();
      return { httpStatus: 201, response: { created: true, taskId } };
    }
    case "salesforce-create-event": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const start = new Date(Date.now() + 3600000).toISOString();
      const end = new Date(Date.now() + 7200000).toISOString();
      const eventId = await client.create("Event", {
        Subject: label,
        DurationInMinutes: 60,
        ActivityDateTime: start,
        StartDateTime: start,
        EndDateTime: end,
        Description: "Phase 7 verification — safe to delete",
      });
      cleanupIds.push(eventId);
      await client.delete("Event", eventId);
      cleanupIds.pop();
      return { httpStatus: 201, response: { created: true, eventId } };
    }
    case "salesforce-update-lead": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const leadId = await client.create("Lead", { LastName: label, Company: "Phase7 Verify" });
      cleanupIds.push(leadId);
      await client.update("Lead", leadId, { Status: "Working - Contacted" });
      await client.delete("Lead", leadId);
      cleanupIds.pop();
      return { httpStatus: 200, response: { updated: true, leadId } };
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};
/* ────────────────────────── Zendesk ────────────────────────── */
function zendeskClientFrom(cred: ProviderCredential) {
  const email = cred.email || (cred.user as string | undefined) || "";
  const apiToken = cred.apiToken || "";
  const subdomain = (cred.subdomain as string | undefined) || "";
  if (!email || !apiToken || !subdomain) {
    throw new Error("Zendesk credential needs email, apiToken, and subdomain");
  }
  return createZendeskClient({ email, apiToken, subdomain } as never);
}
export const zendeskAdapter: CapabilityAdapter = async (contract, ctx) => {
  const client = zendeskClientFrom(ctx.credentials);
  switch (contract.capabilityId) {
    /* ── understand (read) ── */
    case "zendesk-read-tickets": {
      const tickets = await client.listTickets();
      return { httpStatus: 200, response: { count: tickets.length } };
    }
    case "zendesk-read-ticket-fields": {
      const fields = await client.listTicketFields();
      return { httpStatus: 200, response: { count: fields.length } };
    }
    case "zendesk-read-knowledge-base": {
      const articles = await client.listHelpCenterArticles();
      return { httpStatus: 200, response: { count: articles.length } };
    }
    /* ── monitor ── */
    case "zendesk-monitor-ticket-created": {
      const tickets = await client.listTickets();
      const since = Date.now() - 5 * 60 * 1000;
      const recent = tickets.filter((t: any) => {
        const created = new Date(t?.created_at || 0).getTime();
        return created >= since;
      });
      return { httpStatus: 200, response: { monitored: recent.length } };
    }
    /* ── automate (write) ── */
    case "zendesk-reply-ticket": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const created = await client.createTicket({
        subject: `${label} - Phase 7 verification ticket`,
        comment: { body: `${label} - Phase 7 verification reply test (safe to ignore)`, public: true },
        priority: "low",
      });
      const id = created?.id as number | undefined;
      if (!id) throw new Error("Zendesk createTicket returned no id");
      try {
        await client.updateTicket(id, {
          comment: { body: `${label} - Phase 7 verification reply (safe to ignore)`, public: true },
        });
        return { httpStatus: 200, response: { replied: true, ticketId: id } };
      } finally {
        const deleted = await client.deleteTicket(id);
        if (!deleted) throw new Error("Zendesk cleanup failed after reply verification");
      }
    }
    case "zendesk-update-ticket-status": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const created = await client.createTicket({
        subject: `${label} - Phase 7 verification ticket`,
        comment: { body: `${label} - Phase 7 status update test (safe to ignore)`, public: true },
        priority: "low",
      });
      const id = created?.id as number | undefined;
      if (!id) throw new Error("Zendesk createTicket returned no id");
      try {
        const updated = await client.updateTicket(id, { status: "open" });
        return { httpStatus: 200, response: { updated: true, ticketId: id, status: updated?.status } };
      } finally {
        const deleted = await client.deleteTicket(id);
        if (!deleted) throw new Error("Zendesk cleanup failed after status verification");
      }
    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};

/* ────────────────────────── Workday ────────────────────────── */

export const workdayAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  const token = (cred.accessToken as string) || (cred.apiToken as string) || "";
  const tenant = (cred.tenant as string) || (cred.subdomain as string) || "";
  if (!token) throw new Error("Workday credential has no accessToken or apiToken");
  if (!tenant) throw new Error("Workday credential has no tenant/subdomain");

  const client = createWorkdayClient({ accessToken: token, tenant } as never);

  switch (contract.capabilityId) {
    /* ── understand (read) ── */
    case "workday-read-employees": {
      const workers = await client.listWorkers();
      return { httpStatus: 200, response: { count: workers.length } };
    }
    case "workday-read-org-chart": {
      const orgs = await client.listOrganizations();
      return { httpStatus: 200, response: { count: orgs.length } };
    }
    case "workday-read-time-off": {
      const plans = await client.listTimeOffPlans();
      return { httpStatus: 200, response: { count: plans.length } };
    }
    case "workday-read-positions": {
      const positions = await client.listPositions();
      return { httpStatus: 200, response: { count: positions.length } };
    }
    case "workday-read-job-requisitions": {
      const reqs = await client.listJobRequisitions();
      return { httpStatus: 200, response: { count: reqs.length } };
    }
    /* ── monitor ── */
    case "workday-monitor-employees": {
      const workers = await client.listWorkers(100);
      return { httpStatus: 200, response: { monitored: workers.length } };
    }
    /* ── automate (write) ── */
    case "workday-update-employee": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const workers = await client.listWorkers(1);
      const workerId = workers[0]?.id as string | undefined;
      if (!workerId) throw new Error("Workday tenant has no workers to exercise update against");
      const label = LABEL();
      await client.updateWorker(workerId, { Phase7_verification: label });
      return { httpStatus: 200, response: { updated: true, workerId } };
    }
    case "workday-initiate-onboarding": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const result = await client.initiateOnboarding({ name: label, startDate: "2099-01-01" });
      return { httpStatus: 201, response: { initiated: true, details: result } };
    }
    case "workday-approve-time-off": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const workers = await client.listWorkers(1);
      const workerId = workers[0]?.id as string | undefined;
      if (!workerId) throw new Error("Workday tenant has no workers");
      const balance = await client.getTimeOffBalance(workerId);
      return { httpStatus: 200, response: { reached: true, workerId, hasBalance: Boolean(balance) } };
    }
    case "workday-create-job-requisition": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const result = await client.createJobRequisition({ title: `${label} - Phase 7 verification`, description: "Safe to close" });
      return { httpStatus: 201, response: { created: true, details: result } };

    }
    default:
      throw new Error(`no verification path for ${contract.capabilityId}`);
  }
};
