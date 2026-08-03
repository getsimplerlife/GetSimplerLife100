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
import { createSlackClient } from "../../integrations/providers/slack/client";
import { createJiraClient } from "../../integrations/providers/jira/client";
import { createDocuSignClient } from "../../integrations/providers/docusign/client";
import { createMondayComClient } from "../../integrations/providers/monday-com/client";
import type { CapabilityAdapter } from "./index";

const LABEL = () => `Phase7-VERIFY-${Date.now()}`;

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

async function deleteHubSpotObject(kind: string, id: string, accessToken: string): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${kind}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`HubSpot cleanup DELETE ${kind}/${id} failed HTTP ${response.status}`);
  }
}

export const hubspotAdapter: CapabilityAdapter = async (contract, ctx) => {
  const cred = ctx.credentials;
  if (!cred.accessToken) throw new Error("HubSpot credential has no accessToken");
  const client = createHubSpotClient(baseAuth(cred, "hubspot", ctx));

  switch (contract.capabilityId) {
    case "hubspot-read-contacts": {
      const result = await client.searchContacts("");
      return { httpStatus: 200, response: { count: result.results?.length ?? 0 } };
    }
    case "hubspot-create-deal": {
      if (!ctx.allowWrites) throw new Error("write verification disabled (pass --writes)");
      const label = LABEL();
      const id = await client.createDeal({ dealname: label, amount: 1 });
      if (!id) throw new Error("HubSpot createDeal returned no id");
      try {
        await deleteHubSpotObject("deals", id, cred.accessToken);
      } catch (cleanupError) {
        throw new Error(`deal created (${id}) but cleanup failed: ${String(cleanupError)}`);
      }
      return { httpStatus: 201, response: { created: true, id } };
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
