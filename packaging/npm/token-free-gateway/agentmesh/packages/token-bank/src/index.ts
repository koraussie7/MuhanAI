import type { ContributionEvent } from "@agentmesh/core";
export interface TokenLedger { record(event: ContributionEvent): Promise<void>; balance(actorId: string): Promise<number>; }
