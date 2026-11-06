/**
 * native/actions.ts — NATIVE write executors for the six portal modules that
 * queue their writes through the Approval Queue (slice 198).
 *
 * WHY THIS FILE EXISTS (the 11-06 portal sweep, finding P1-1):
 *   Every native create — proposal, invoice, deal room, checklist, survey,
 *   booking page — is routed to the Approval Queue by its gate, which stores a
 *   pending action under a name like `createProposal`. Approving that card in
 *   `/portal/approvals` runs `executeAction()`, which looks the name up in the
 *   engine Action Registry. The registry had exactly ONE native provider — the
 *   vault (see `src/integrations/providers/vault/actions.ts`, the precedent for
 *   this file, and `src/test/vault-approval-execution.test.ts`, the same bug
 *   fixed once before). So approving a native create answered
 *   `Unknown action: "createProposal"`, the card left the queue, and the write
 *   stayed `pending` forever. The product could not create one record through
 *   its own portal.
 *
 * THE RULE THIS FILE KEEPS:
 *   A handler here performs the module's OWN apply path — it calls the module's
 *   `executePending*Write()`, the exact function that module's own approve
 *   endpoint calls. It does NOT re-implement the write. A second writer is how
 *   the two paths drift, and a drift between "what the card says" and "what the
 *   store holds" is the failure this slice exists to remove.
 *
 * WHAT EACH HANDLER GUARANTEES:
 *   - TENANT comes from the executor's resolved context (`{ tenantId, dataDir }`),
 *     never from the payload. The pending-write lookup is tenant-scoped, so an
 *     approval record from another tenant simply is not found and the write is
 *     refused. A payload that names another tenant is ignored.
 *   - IDEMPOTENT: the module executor is keyed by the approval action id and
 *     replays its stored result, so executing the same decision twice cannot
 *     create two records.
 *   - AUDITED: the module's own apply path appends its `native.*` audit entry
 *     naming the created record's id; the portal's approve route appends
 *     `portal.approvals.approve` with the same id.
 *
 * WHY THE ACTION NAMES ARE LITERALS HERE:
 *   Importing the six gates at module load would close an import cycle
 *   (gate → approval-queue → this file → gate) and the queue imports this file
 *   to answer "can anything execute this action?" at ENQUEUE time. So the gate
 *   modules are loaded lazily, inside the handler. The cost is that the names
 *   are written twice; the guard against that drift is a test, not a comment:
 *   `src/test/native-executors-198.test.ts` reads every exported action-name map
 *   from the six gates and asserts each name is registered here.
 */
import { actionRegistry, type ActionDefinition, type ActionHandlerRegistry } from "../engine/action-registry";

/** Context the executor injects for native (connection-less) actions. */
export interface NativeActionContext {
  tenantId: string;
  dataDir: string;
  /** The Approval Queue record this execution is fulfilling. */
  approvalActionId?: string;
}

/** Shape every module's `executePending*Write()` returns. */
type PendingWriteOutcome = { ok: boolean; reason?: string } & Record<string, any>;

/** The module's own apply path, as every gate declares it. */
type PendingWriteExecutor = (
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
) => PendingWriteOutcome | Promise<PendingWriteOutcome>;

interface NativeModuleSpec {
  /** Provider id the module's gate passes to `approvalGate`. */
  provider: string;
  /** Readable module name for the action description. */
  label: string;
  /** Every action name the module's gate can enqueue. */
  actions: readonly string[];
  /** Lazy access to the module's own approve-path executor. */
  load: () => Promise<PendingWriteExecutor>;
}

const NATIVE_MODULES: NativeModuleSpec[] = [
  {
    provider: "native-proposals",
    label: "proposal",
    actions: [
      "createProposal",
      "updateProposal",
      "openProposal",
      "approveProposal",
      "rejectProposal",
      "sendProposal",
      "deleteProposal",
      "revokeProposalShare",
    ],
    load: async () => (await import("./proposals/gate")).executePendingProposalWrite,
  },
  {
    provider: "native-invoices",
    label: "invoice",
    actions: [
      "createInvoice",
      "generateInvoice",
      "sendInvoice",
      "deleteInvoice",
      "revokeInvoiceShare",
      "rotateInvoiceShare",
    ],
    load: async () => (await import("./invoice/gate")).executePendingInvoiceWrite,
  },
  {
    provider: "native-dealrooms",
    label: "deal room",
    actions: ["createDealRoom", "updateDealRoom", "archiveDealRoom", "deleteDealRoom", "revokeDealRoomShare"],
    load: async () => (await import("./dealroom/gate")).executePendingDealRoomWrite,
  },
  {
    provider: "native-checklists",
    label: "checklist",
    actions: ["createChecklist", "updateChecklist", "closeChecklist", "deleteChecklist"],
    load: async () => (await import("./checklists/gate")).executePendingChecklistWrite,
  },
  {
    provider: "native-survey",
    label: "survey",
    actions: ["createSurvey", "updateSurvey", "publishSurvey", "archiveSurvey", "deleteSurvey", "submitSurveyResponse"],
    load: async () => (await import("./survey/gate")).executePendingSurveyWrite,
  },
  {
    provider: "native-bookings",
    label: "booking page",
    actions: [
      "createBookingPage",
      "updateBookingPage",
      "publishBookingPage",
      "archiveBookingPage",
      "deleteBookingPage",
      "requestBooking",
      "confirmBooking",
      "cancelBooking",
    ],
    load: async () => (await import("./booking/gate")).executePendingBookingWrite,
  },
];

/**
 * Providers whose writes are meant to execute THROUGH the engine registry, and
 * whose registration this file owns.
 *
 * The Approval Queue uses this to refuse an action it could not execute, at
 * enqueue, instead of minting a card that can only ever fail. Two deliberate
 * exclusions:
 *   - the VAULT is queue-executable, but it registers itself in
 *     `integration-tools.ts`, which the server loads lazily on the approve path.
 *     At enqueue time that registry entry may not exist yet, and refusing on that
 *     basis would break a vault write that works. So the vault is not guarded
 *     here rather than guarded wrongly.
 *   - the other native gates (tables, boards, transport, …) apply their writes
 *     through their own module approve endpoint; refusing those would break a
 *     path that works today.
 */
export const QUEUE_EXECUTABLE_PROVIDERS: readonly string[] = NATIVE_MODULES.map((m) => m.provider);

/** Every action name this file registers (used by the drift test). */
export function nativeExecutorActionNames(): string[] {
  return NATIVE_MODULES.flatMap((m) => [...m.actions]);
}

function buildActions(spec: NativeModuleSpec): ActionDefinition[] {
  return spec.actions.map((actionName) => ({
    name: actionName,
    description:
      `Apply the ${spec.label} write a human approved in the Approval Queue (${actionName}). ` +
      `Executes ${spec.provider}'s own pending-write apply path for the resolved tenant; ` +
      `idempotent per approval action id and audited with the created record's id.`,
    inputSchema: {
      type: "object",
      properties: {
        approvalActionId: {
          type: "string",
          description: "The Approval Queue record being executed (resolved by the executor, not the caller)",
        },
      },
      required: [],
    },
    handler: async (config: any) => {
      const ctx = (config || {}) as NativeActionContext;
      const tenantId = typeof ctx.tenantId === "string" ? ctx.tenantId.trim() : "";
      const dataDir = typeof ctx.dataDir === "string" ? ctx.dataDir : "";
      const approvalActionId = typeof ctx.approvalActionId === "string" ? ctx.approvalActionId.trim() : "";
      // Fail-closed on identity: the tenant is the executor's resolved caller.
      if (!tenantId) throw new Error(`${actionName} refused — no tenant resolved for this execution`);
      if (!approvalActionId) {
        throw new Error(
          `${actionName} refused — no approval action id was supplied, so there is no approved pending write to apply`,
        );
      }
      // NOTE: the payload handed to this handler is deliberately NOT used. The
      // write that executes is the durable pending-write mirror the human
      // approved, looked up per tenant inside the module's own executor.
      const run = await spec.load();
      const outcome = await run(dataDir, tenantId, approvalActionId, tenantId);
      if (!outcome || outcome.ok !== true) {
        throw new Error(outcome?.reason || `${actionName} did not apply — the module refused the write`);
      }
      return outcome;
    },
  }));
}

const registeredIn = new WeakSet<ActionHandlerRegistry>();

/**
 * Register the native executors. Idempotent per registry — the Approval Queue
 * calls it on every enqueue (it is a map lookup after the first call) and
 * `integration-tools.ts` calls it once at load, the same way vault registers.
 */
export function registerNativeExecutors(registry: ActionHandlerRegistry = actionRegistry): void {
  if (registeredIn.has(registry)) return;
  registeredIn.add(registry);
  for (const spec of NATIVE_MODULES) {
    registry.registerProvider(spec.provider, buildActions(spec), { native: true });
  }
}

/** True when `provider` is one this file makes executable through the engine. */
export function isQueueExecutableProvider(provider: string): boolean {
  return QUEUE_EXECUTABLE_PROVIDERS.includes(provider);
}
