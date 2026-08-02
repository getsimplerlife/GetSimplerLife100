import { ORCHESTRATION_CHAINS } from "./chains";
import type { OrchestrationEvent } from "./types";
const active = new Set<string>();
export function activateChain(chainId: string): boolean { if (!ORCHESTRATION_CHAINS.some(c => c.id === chainId)) return false; active.add(chainId); return true; }
export function deactivateChain(chainId: string): boolean { return active.delete(chainId); }
export function isChainActive(chainId: string): boolean { return active.has(chainId); }
export function evaluateTriggers(event: OrchestrationEvent): string[] { return ORCHESTRATION_CHAINS.filter(c => active.has(c.id) && c.trigger.type === "event" && c.trigger.providerId === event.providerId && c.trigger.eventType === event.eventType).map(c => c.id); }
export function clearActivations(): void { active.clear(); }
