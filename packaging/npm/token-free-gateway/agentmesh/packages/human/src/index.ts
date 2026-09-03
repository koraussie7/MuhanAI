export type HumanCapability = "answer" | "verify" | "teach" | "local_knowledge" | "expert";
export interface HumanSubmission { actorId: string; content: string; capability: HumanCapability; }
