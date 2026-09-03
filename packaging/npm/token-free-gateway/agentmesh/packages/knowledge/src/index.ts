import type { KnowledgeRecord } from "@agentmesh/core";
export interface KnowledgeStore { put(record: KnowledgeRecord): Promise<void>; search(query: string): Promise<KnowledgeRecord[]>; }
