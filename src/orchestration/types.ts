export type TriggerCondition = { type: "event" | "schedule" | "manual"; providerId?: string; eventType?: string; cron?: string };
export type InputMapping = Record<string, string>;
export interface ChainStep { order: number; employeeId: string; capabilityId: string; inputMapping: InputMapping; condition?: (context: Record<string, unknown>) => boolean; }
export interface OrchestrationChain { id: string; name: string; steps: ChainStep[]; trigger: TriggerCondition; }
export interface StepResult { step: ChainStep; status: "processed" | "failed" | "skipped"; output?: unknown; error?: string; startedAt: string; completedAt: string; }
export interface ChainExecution { id: string; chainId: string; status: "processed" | "failed" | "skipped"; steps: StepResult[]; startedAt: string; completedAt?: string; }
export interface OrchestrationEvent { providerId: string; eventType: string; payload?: unknown; }
