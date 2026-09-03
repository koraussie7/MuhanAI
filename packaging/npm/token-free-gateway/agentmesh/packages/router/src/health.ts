import type { AgentHealth } from "@agentmesh/core";
export function isHealthy(health: AgentHealth): boolean { return health.online; }
