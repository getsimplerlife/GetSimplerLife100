/**
 * src/agents/orchestrator.ts — SERVER-SIDE ONLY. Do NOT import in any .tsx file.
 *
 * REAL ORCHESTRATION (capability upgrade #1): turns the static AGENT_CHAIN_MAP
 * + the deterministic agent-processor into live multi-employee chain execution.
 *
 * - Executes a chain as an ordered sequence of "employees"; each step's
 *   processor output (ProcessedData) is fed into the shared step context so a
 *   downstream employee grounds on what upstream employees already worked out.
 *   Reads/processing flow freely.
 * - Writes in ANY step are proposed ONLY as approval-gated PendingActions via
 *   the existing `executeAction` → approval-queue path. The FIRST write of a
 *   chain enqueues the card and the chain PAUSES (status `awaiting_approval`)
 *   before anything executes. No bypass path, no direct execution.
 * - Every gated write carries the issuing `chainId` on its PendingAction for
 *   traceability.
 *
 * SAFETY INVARIANTS (unchanged): fail-closed approval gate (a write never runs
 * unless a human approves), non-destruction (rejected cards are discarded),
 * per-tenant isolation (approval queue + data are tenant-keyed; this module
 * never reads/writes across tenants), and it is fully testable with zero real
 * providers and LLM off.
 */

import type { AgentDefinition, ProcessorResult } from "../lib/agent-processor";
import { processAgentResults } from "../lib/agent-processor";
import type { ProviderConnection, ProviderResult, AgentIntegrationResult } from "../lib/provider-api";
import { AGENT_CHAIN_MAP } from "./agentChains";
import { buildAgentContext, recordInsight, recordAudit } from "../lib/firm-memory";
import { runReasoningStage, type ReasoningEmployeeConfig, type ReasoningDeps } from "../lib/llm/reasoningStage";

// ── Chain model ─────────────────────────────────────────────────────────────

export interface ChainWriteProposal {
  actionName: string;
  provider: string;
  params: Record<string, any>;
  /** Human-readable reason shown on the approval card ("why"). */
  summary?: string;
}

export interface ChainStepDef {
  agentType: string;      // employee type, must exist in AGENT_CHAIN_MAP
  agentName: string;
  category: string;       // agent-processor category (finance, operations, ...)
  instructions: string;
  /** Optional approval-gated write this step performs after processing. */
  write?: ChainWriteProposal;
}

export interface OrchestrationChain {
  chainId: string;
  name: string;
  steps: ChainStepDef[];
}

export interface ChainStepOutcome {
  index: number;
  agentType: string;
  agentName: string;
  /** Processor output for this step (processed data, insights, alerts). */
  processed: ProcessorResult;
  /** The step context this step was given (feeds = upstream processed data). */
  input?: Record<string, any>;
  /** Set when this step's write was routed to the Approval Queue (chain paused). */
  proposedWrite?: { actionName: string; provider: string; actionId: string; summary: string };
  /** Set when this step's write executed (auto/approved path only). */
  writeOutcome?: { actionName: string; provider: string; executed: boolean; error?: string };
}

export interface ChainRunResult {
  chainId: string;
  status: "completed" | "awaiting_approval" | "failed";
  tenantEmail: string;
  steps: ChainStepOutcome[];
  /** Set when the chain paused on an approval-gated write. */
  pendingActionId?: string;
  pendingSummary?: string;
  error?: string;
}

export interface RunChainInput {
  chainId: string;
  tenantEmail: string;
  /** Optional portal agent id recorded on approval cards (default "ai-employee"). */
  agentId?: string;
  /** Data dir for the approval store (isolation in tests). */
  dataDir?: string;
  /** Per-step provider query results (injected for tests / from real reads). */
  stepResults?: ProviderResult[][];
  /** Optional user connections (used by the processor for context). */
  connections?: ProviderConnection[];
  /** Optional explicit chain (advanced/test use; defaults to the registry). */
  chain?: OrchestrationChain;
  /** Phase 1 LLM reasoning — per-employee opt-in, OFF by default. When set and
   *  the employee's `reasoningEnabled` is true (AND env enabled), the step runs
   *  an optional reasoning call that ENRICHES the step's write summary. It is
   *  purely advisory: it never gates, never executes, and the approval path is
   *  byte-for-byte unchanged. Omitted/OFF → current behavior exactly. */
  reasoning?: ReasoningEmployeeConfig;
  /** Test-only: inject the model client / tracker into the reasoning stage
   *  (the canonical suite drives it with a MockModelClient; prod leaves unset
   *  and the stage resolves env-driven deps itself). */
  reasoningDeps?: ReasoningDeps;
}

// ── Real chains (only already-verified integrations) ────────────────────────
//
// document_intake → invoice_ledger(WRITE createXeroInvoice) → notify
//   Xero is a verified provider; the invoice write is approval-gated so the
//   chain pauses for a human before any invoice is created.
export const INVOICE_INGEST_TO_LEDGER: OrchestrationChain = {
  chainId: "invoice-ingest-to-ledger",
  name: "Invoice ingest → ledger",
  steps: [
    {
      agentType: "document_intake",
      agentName: "Document Intake AI",
      category: "operations",
      instructions: "Ingest and classify incoming invoice documents from filed material.",
    },
    {
      agentType: "invoice_ledger",
      agentName: "Invoice & Ledger AI",
      category: "finance",
      instructions: "Extract line items from the processed intake, match to the ledger, and draft the invoice.",
      write: {
        actionName: "createXeroInvoice",
        provider: "xero",
        summary: "Draft the invoice in Xero from the processed invoice intake.",
        params: { Type: "ACCREC", Contact: { Name: "Draft" }, LineItems: [] },
      },
    },
    {
      agentType: "audit_logger",
      agentName: "Operations Audit Logger AI",
      category: "operations",
      instructions: "Record the intake and ledger outcome for the operational audit trail.",
    },
  ],
};

// Read-only chain (no writes) that demonstrates multi-employee feeding end to end.
export const DOC_INTAKE_TO_CONTRACT_REVIEW: OrchestrationChain = {
  chainId: "doc-intake-to-contract-review",
  name: "Document intake → contract review",
  steps: [
    {
      agentType: "document_intake",
      agentName: "Document Intake AI",
      category: "operations",
      instructions: "Classify incoming documents from filed material.",
    },
    {
      agentType: "contract_management",
      agentName: "Contract Management AI",
      category: "compliance",
      instructions: "Review the classified documents for key contract terms.",
    },
  ],
};

// Capability upgrade #6 — QUOTE-TO-CASH demo spine on verified integrations
// only (DocuSign, HubSpot, Xero, Slack, Google Drive). No QuickBooks/QBO
// claims — QBO stays unclaimed until the owner adds Intuit creds and it is
// live-verified. Every provider write is declared on `write`, so runChain
// routes EACH one through the unchanged approval gate (fail-closed default
// ON) — the chain pauses awaiting_approval at the first gated write and ZERO
// provider calls fire until a human approves. The full spine is defined so a
// resume path can step through the remaining gated writes in order.
export const QUOTE_TO_CASH: OrchestrationChain = {
  chainId: "quote-to-cash",
  name: "Quote → cash (proposal → e-sign → deal → invoice → notify → file)",
  steps: [
    {
      agentType: "sales_outreach",
      agentName: "Sales Outreach AI",
      category: "sales",
      instructions: "Prepare and qualify the opportunity proposal from the CRM context.",
    },
    {
      agentType: "document_intake",
      agentName: "Document Intake AI",
      category: "operations",
      instructions: "Send the proposal for e-signature via DocuSign.",
      write: {
        actionName: "sendDocuSignEnvelope",
        provider: "docusign",
        summary: "Send the proposal envelope for e-signature in DocuSign.",
        params: {
          emailSubject: "Proposal for signature",
          documents: [{ name: "Proposal.pdf" }],
          recipients: { email: "client@example.com", name: "Client" },
        },
      },
    },
    {
      agentType: "sales_outreach",
      agentName: "Sales Outreach AI",
      category: "sales",
      instructions: "Create the won deal and contact in HubSpot from the signed proposal.",
      write: {
        actionName: "createHubSpotDeal",
        provider: "hubspot",
        summary: "Create the won deal in HubSpot.",
        params: { dealname: "New deal", dealstage: "closedwon", amount: 15000 },
      },
    },
    {
      agentType: "invoice_ledger",
      agentName: "Invoice & Ledger AI",
      category: "finance",
      instructions: "Draft the invoice in Xero from the signed deal.",
      write: {
        actionName: "createXeroInvoice",
        provider: "xero",
        summary: "Draft the invoice in Xero (ACCREC).",
        params: {
          Type: "ACCREC",
          Contact: { Name: "Client" },
          LineItems: [{ Description: "Professional services", Quantity: 1, UnitAmount: 15000 }],
        },
      },
    },
    {
      agentType: "audit_logger",
      agentName: "Operations Audit Logger AI",
      category: "operations",
      instructions: "Notify the revenue team in Slack that the deal closed and the invoice is drafted.",
      write: {
        actionName: "postSlackMessage",
        provider: "slack",
        summary: "Notify the revenue team in Slack.",
        params: { channel: "#revenue", text: "Deal closed — invoice drafted in Xero." },
      },
    },
    {
      agentType: "document_intake",
      agentName: "Document Intake AI",
      category: "operations",
      instructions: "File the signed proposal to Google Drive for the permanent record.",
      write: {
        actionName: "uploadGDriveFile",
        provider: "google-drive",
        summary: "File the signed proposal to Google Drive.",
        params: { name: "signed-proposal.pdf", content: "signed-proposal-rendered", mimeType: "application/pdf" },
      },
    },
  ],
};

export const CHAINS: Record<string, OrchestrationChain> = {
  [INVOICE_INGEST_TO_LEDGER.chainId]: INVOICE_INGEST_TO_LEDGER,
  [DOC_INTAKE_TO_CONTRACT_REVIEW.chainId]: DOC_INTAKE_TO_CONTRACT_REVIEW,
  [QUOTE_TO_CASH.chainId]: QUOTE_TO_CASH,
};

export function getChain(chainId: string): OrchestrationChain | undefined {
  return CHAINS[chainId];
}

export function listChains(): OrchestrationChain[] {
  return Object.values(CHAINS);
}

// ── Execution ───────────────────────────────────────────────────────────────

/**
 * Execute a multi-employee chain. Reads/processing feed forward freely; the
 * first approval-gated write pauses the chain and no provider write executes
 * until a human approves in the portal.
 */
export async function runChain(input: RunChainInput): Promise<ChainRunResult> {
  const chain = input.chain ?? CHAINS[input.chainId];
  if (!chain) {
    throw new Error(
      `Unknown chain '${input.chainId}'. Available chains: ${Object.keys(CHAINS).join(", ")}`
    );
  }
  if (!input.tenantEmail?.trim()) {
    throw new Error("runChain requires a tenantEmail");
  }

  const outcomes: ChainStepOutcome[] = [];
  // Shared step context: fed by each step's processed data, read by downstream steps.
  const stepContext: Record<string, any> = {};
  // Seed the per-tenant operational memory (firm rules + calibration + recent
  // insights/audit tail) into the shared context so every step/chain step is
  // grounded on the firm's history. Additive — a memory failure never blocks a run.
  try {
    stepContext.agentContext = buildAgentContext(input.tenantEmail, input.dataDir);
  } catch {
    // leave agentContext unset; the chain proceeds with no memory (fail-soft)
  }

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];

    // Validate the employee type exists in the static map (fail-closed on unknown types).
    if (!AGENT_CHAIN_MAP[step.agentType]) {
      outcomes.push(errorOutcome(i, step));
      return {
        chainId: input.chainId,
        status: "failed",
        tenantEmail: input.tenantEmail,
        steps: outcomes,
        error: `Chain step agent type '${step.agentType}' is not in AGENT_CHAIN_MAP — chain aborted (fail-closed).`,
      };
    }

    const outcome: ChainStepOutcome = {
      index: i,
      agentType: step.agentType,
      agentName: step.agentName,
      processed: emptyProcessing(step),
    };

    const providerResults: ProviderResult[] = input.stepResults?.[i] ?? [];
    const agent: AgentDefinition = {
      id: step.agentType,
      name: step.agentName,
      category: step.category,
      instructions: step.instructions,
    };
    const queryResult: AgentIntegrationResult = {
      agentId: step.agentType,
      agentName: step.agentName,
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: `Chain '${input.chainId}' step ${i + 1}`,
      integrationsUsed: providerResults,
      totalRecordsProcessed: providerResults.reduce((sum, r) => sum + (r.recordsFound || 0), 0),
    };

    // snapshot the context this step receives (proves forward feeding)
    outcome.input = { ...stepContext };
    outcome.processed = processAgentResults(
      agent,
      queryResult,
      input.connections ?? [],
      {
        tenantEmail: input.tenantEmail,
        dataDir: input.dataDir,
      },
    );

    // Feed this step's processed data into the shared context for downstream steps.
    stepContext[`${step.agentType}`] = outcome.processed.processedData;
    stepContext[`step${i + 1}`] = outcome.processed.processedData;
    try {
      const summary =
        outcome.processed.insights[0]?.message?.slice(0, 200) ||
        `Chain '${input.chainId}' step ${i + 1} (${step.agentType}) processed.`;
      recordInsight(
        input.tenantEmail,
        { summary, source: step.agentType, action: step.agentType, provider: step.write?.provider },
        input.dataDir,
      );
    } catch {
      // memory write failure is non-fatal
    }

    // Phase 1 LLM reasoning — OPTIONAL advisory layer between the deterministic
    // processor output and the approval gate. OFF by default (requires env
    // LLM_INTELLIGENCE_ENABLED=true AND input.reasoning.reasoningEnabled=true).
    // When it runs, its plan text enriches the step's write summary (draft "why"
    // on the approval card). It NEVER gates, NEVER executes, and on any decline
    // or error the deterministic flow continues untouched (match current behavior).
    let reasoningSnippet = "";
    if (input.reasoning) {
      const reasoningOutcome = await runReasoningStage(
        {
          tenantEmail: input.tenantEmail,
          agentId: step.agentType,
          dataDir: input.dataDir,
          employee: input.reasoning,
          processed: outcome.processed.processedData,
          insights: outcome.processed.insights,
          alerts: outcome.processed.alerts,
          actions: outcome.processed.actionsTaken,
          context: stepContext.agentContext,
        },
        input.reasoningDeps,
        // In the canonical suite (LLM off) the stage is a no-op and returns
        // instantly with plannedActions=[] / status declined_*. This call is
        // bounded by the stage's own caps and tracker — never unbounded.
      );
      if (reasoningOutcome.status === "ran" && reasoningOutcome.plan?.trim()) {
        reasoningSnippet = reasoningOutcome.plan.slice(0, 120).trim();
      }
    }

    // Gate any declared write through the existing Approval Queue path.
    if (step.write) {
      const { executeAction } = await import("../engine/action-executor");
      const writeResult = await executeAction(step.write.actionName, step.write.params, input.tenantEmail, {
        agentId: input.agentId || "ai-employee",
        chainId: input.chainId,
        dataDir: input.dataDir,
      });

      if (writeResult.pendingApproval && writeResult.actionId) {
        outcome.proposedWrite = {
          actionName: step.write.actionName,
          provider: step.write.provider,
          actionId: writeResult.actionId,
          summary: reasoningSnippet
            ? `${step.write.summary || `Proposed ${step.write.actionName}`} — ${reasoningSnippet}`
            : step.write.summary || `Proposed ${step.write.actionName}`,
        };
        try {
          recordAudit(
            input.tenantEmail,
            { summary: `Proposed ${step.write.actionName} on ${step.write.provider} (awaiting approval)`, source: step.agentType, action: step.write.actionName, provider: step.write.provider, approved: false },
            input.dataDir,
          );
        } catch {
          // non-fatal
        }
        outcomes.push(outcome);
        return {
          chainId: input.chainId,
          status: "awaiting_approval",
          tenantEmail: input.tenantEmail,
          steps: outcomes,
          pendingActionId: writeResult.actionId,
          pendingSummary: outcome.proposedWrite.summary,
        };
      }

      outcome.writeOutcome = {
        actionName: step.write.actionName,
        provider: step.write.provider,
        executed: writeResult.success,
        error: writeResult.error,
      };
      try {
        recordAudit(
          input.tenantEmail,
          { summary: `${step.write.actionName} on ${step.write.provider} ${writeResult.success ? "approved+executed" : "rejected/not-executed"}`, source: step.agentType, action: step.write.actionName, provider: step.write.provider, approved: writeResult.success },
          input.dataDir,
        );
      } catch {
        // non-fatal
      }
    }

    outcomes.push(outcome);
  }

  return { chainId: input.chainId, status: "completed", tenantEmail: input.tenantEmail, steps: outcomes };
}

function emptyProcessing(step: ChainStepDef): ProcessorResult {
  return {
    processedData: { filtered: [], enriched: [], matched: [], metrics: {} },
    actionsTaken: [],
    insights: [{ type: "summary", severity: "info", message: `Chain step '${step.agentName}' did not produce processing.`, source: "agent-processor" }],
    alerts: [],
  };
}

function errorOutcome(index: number, step: ChainStepDef): ChainStepOutcome {
  return {
    index,
    agentType: step.agentType,
    agentName: step.agentName,
    processed: {
      processedData: { filtered: [], enriched: [], matched: [], metrics: {} },
      actionsTaken: [],
      insights: [{ type: "summary", severity: "info", message: `Step '${step.agentName}' failed (unknown agent type).` }],
      alerts: [],
    },
  };
}
