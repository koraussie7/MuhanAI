export type MeshEvent =
  | { type: "agent.registered"; agentId: string; timestamp: number }
  | { type: "cast.started"; requestId: string; timestamp: number }
  | { type: "cast.completed"; requestId: string; timestamp: number };

export type EventListener = (event: MeshEvent) => void;
