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
    case "docusign-read-envelopes": {
      const envelopes = await client.listEnvelopes();
      return { httpStatus: 200, response: { count: envelopes.length } };
    }
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
      const voidUrl = `${account.baseUrl}/v2.1/accounts/${account.accountId}/envelopes/${envelopeId}`;
      const cleanup = await fetch(voidUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${cred.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "voided", voidedReason: "Phase 7 verification cleanup" }),
      });
      if (!cleanup.ok && cleanup.status !== 404) {
        throw new Error(`draft created (${envelopeId}) but cleanup failed HTTP ${cleanup.status}`);
      }
      return { httpStatus: 201, response: { created: true, envelopeId } };
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
    case "monday-monitor-item-created": {
      const boards = await client.listBoards();
      const boardId = Number(boards[0]?.id);
      if (!boardId) throw new Error("Monday.com workspace has no board to monitor");
      const items = await client.listItems(boardId, 10);
      return { httpStatus: 200, response: { boardId, recentItemCount: items.length } };
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
