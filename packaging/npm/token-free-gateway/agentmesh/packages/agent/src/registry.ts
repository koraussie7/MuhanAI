import type { AgentAdapter, AgentDescriptor } from "@agentmesh/core";

export class AgentRegistry {
  private readonly adapters = new Map<string, AgentAdapter>();
  register(adapter: AgentAdapter): void { this.adapters.set(adapter.id, adapter); }
  unregister(id: string): boolean { return this.adapters.delete(id); }
  get(id: string): AgentAdapter | undefined { return this.adapters.get(id); }
  has(id: string): boolean { return this.adapters.has(id); }
  all(): AgentAdapter[] { return [...this.adapters.values()]; }
  async descriptors(): Promise<AgentDescriptor[]> {
    return Promise.all(this.all().map(async (adapter) => ({
      id: adapter.id, name: adapter.id, capabilities: adapter.capabilities(), cost: 0, latencyMs: (await adapter.health()).latency,
    })));
  }
}
