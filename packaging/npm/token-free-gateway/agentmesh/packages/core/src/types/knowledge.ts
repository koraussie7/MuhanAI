export interface Evidence { source: string; excerpt?: string; uri?: string }
export interface Provenance { actorId: string; kind: "human" | "agent" | "source"; timestamp: number }
export interface KnowledgeRecord {
  id: string;
  claim: string;
  evidence: Evidence[];
  confidence: number;
  provenance: Provenance[];
  verifiedBy: string[];
  createdAt: number;
}
