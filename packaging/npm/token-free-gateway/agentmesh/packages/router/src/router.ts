import type { AgentDiscovery } from "@agentmesh/agent";
import type { AgentDescriptor, AgentRequest } from "@agentmesh/core";
import { defaultPolicy, type RoutingPolicy, rankAgents } from "./policy.js";

export class AgentRouter {
	constructor(
		private readonly discovery: AgentDiscovery,
		private readonly policy: RoutingPolicy = defaultPolicy,
	) {}
	async select(request: AgentRequest): Promise<AgentDescriptor[]> {
		return rankAgents(
			request,
			await this.discovery.available(request.requiredCapabilities),
			this.policy,
		);
	}
}
