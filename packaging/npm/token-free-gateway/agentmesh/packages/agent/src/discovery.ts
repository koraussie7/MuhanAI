import type { AgentDescriptor } from "@agentmesh/core";
import type { AgentRegistry } from "./registry.js";

export class AgentDiscovery {
	constructor(private readonly registry: AgentRegistry) {}
	async available(required: string[] = []): Promise<AgentDescriptor[]> {
		const agents = await this.registry.descriptors();
		return agents.filter((agent) =>
			required.every((capability) => agent.capabilities.includes(capability)),
		);
	}
}
