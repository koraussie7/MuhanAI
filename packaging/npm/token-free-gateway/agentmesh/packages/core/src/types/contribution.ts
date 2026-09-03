export type ContributionType = "answer" | "verify" | "teach" | "compute" | "mcp";
export interface ContributionEvent {
  actorId: string;
  type: ContributionType;
  quality: number;
  reward: number;
  timestamp: number;
}
