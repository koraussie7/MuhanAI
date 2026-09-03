import type { AgentDescriptor, AgentRequest } from "@agentmesh/core";

export interface RoutingPolicy { maxAgents: number; maxCost: number; maxLatencyMs: number }
export const defaultPolicy: RoutingPolicy = { maxAgents: 3, maxCost: 0, maxLatencyMs: 10_000 };

export function rankAgents(request: AgentRequest, agents: AgentDescriptor[], policy = defaultPolicy): AgentDescriptor[] {
  return agents.filter((agent) =>
    agent.cost <= policy.maxCost && agent.latencyMs <= policy.maxLatencyMs &&
    (request.requiredCapabilities ?? []).every((capability) => agent.capabilities.includes(capability)),
  ).sort((a, b) => a.latencyMs - b.latencyMs).slice(0, policy.maxAgents);
}
