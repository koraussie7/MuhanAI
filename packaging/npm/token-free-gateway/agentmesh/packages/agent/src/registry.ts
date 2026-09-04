import type { AgentAdapter, AgentDescriptor, AgentType } from "@agentmesh/core";

export interface RegistryStats {
  total: number;
  online: number;
  byType: Partial<Record<AgentType, number>>;
  onlineByType: Partial<Record<AgentType, number>>;
  avgLatencyMs: number;
  checkedAt: number;
}

interface HealthSnapshot {
  online: boolean;
  latency: number;
  checkedAt: number;
}

/**
 * Central agent registry. Health snapshots make /api/pulse and
 * /api/network/stats reflect the real registered network (review §1) instead
 * of static demo numbers.
 */
export class AgentRegistry {
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly healthCache = new Map<string, HealthSnapshot>();

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter);
    this.healthCache.delete(adapter.id);
  }
  unregister(id: string): boolean {
    this.healthCache.delete(id);
    return this.adapters.delete(id);
  }
  get(id: string): AgentAdapter | undefined { return this.adapters.get(id); }
  has(id: string): boolean { return this.adapters.has(id); }
  all(): AgentAdapter[] { return [...this.adapters.values()]; }

  /** Probe every adapter and cache the result (bounded by adapter timeouts). */
  async refreshHealth(): Promise<void> {
    await Promise.allSettled(this.all().map(async (adapter) => {
      const health = await adapter.health();
      this.healthCache.set(adapter.id, {
        online: health.online,
        latency: health.latency,
        checkedAt: health.checkedAt ?? Date.now(),
      });
    }));
  }

  healthOf(id: string): HealthSnapshot | undefined {
    return this.healthCache.get(id);
  }

  async descriptors(): Promise<AgentDescriptor[]> {
    return Promise.all(this.all().map(async (adapter) => {
      const health = this.healthCache.get(adapter.id) ?? (await adapter.health());
      return {
        id: adapter.id,
        name: adapter.displayName ?? adapter.id,
        type: adapter.type ?? "llm",
        capabilities: adapter.capabilities(),
        cost: 0,
        latencyMs: health.latency,
        health: {
          online: health.online,
          latency: health.latency,
          checkedAt: health.checkedAt ?? Date.now(),
        },
      };
    }));
  }

  /** Aggregated network snapshot: counts by type, online ratio, latency. */
  async stats(): Promise<RegistryStats> {
    const descriptors = await this.descriptors();
    const byType: Partial<Record<AgentType, number>> = {};
    const onlineByType: Partial<Record<AgentType, number>> = {};
    let online = 0;
    let latencySum = 0;
    for (const descriptor of descriptors) {
      byType[descriptor.type] = (byType[descriptor.type] ?? 0) + 1;
      if (descriptor.health?.online) {
        online += 1;
        onlineByType[descriptor.type] = (onlineByType[descriptor.type] ?? 0) + 1;
        latencySum += descriptor.latencyMs;
      }
    }
    return {
      total: descriptors.length,
      online,
      byType,
      onlineByType,
      avgLatencyMs: online > 0 ? Math.round(latencySum / online) : 0,
      checkedAt: Date.now(),
    };
  }
}

