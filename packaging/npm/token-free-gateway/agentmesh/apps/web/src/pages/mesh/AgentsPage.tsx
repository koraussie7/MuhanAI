import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #6: Agents (mesh registry)
// Data source: GET /api/agents — the live AgentRegistry descriptors.
// =====================================================================
interface AgentDescriptorView {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  cost: number;
  latencyMs: number;
  health?: { online: boolean; latency: number; checkedAt?: number };
}

function statusLabel(agent: AgentDescriptorView): string {
  if (agent.health?.online) return "● Online";
  if (agent.health) return "○ Offline";
  return "? Unknown";
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentDescriptorView[]>([]);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    load<AgentDescriptorView[]>("/api/agents").then((d) => d && setAgents(d));
  }, []);

  const types = ["All", ...Array.from(new Set(agents.map((a) => a.type)))];
  const shown =
    filter === "All" ? agents : agents.filter((a) => a.type === filter);

  return (
    <SpecPage
      title="Agents"
      subtitle={`${agents.filter((a) => a.health?.online).length}/${agents.length} online — live AgentRegistry`}
    >
      <div className="policy-row">
        {types.map((t) => (
          <button
            key={t}
            className={t === filter ? "policy-chip active" : "policy-chip"}
            onClick={() => setFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="agent-card-grid">
        {shown.map((a) => (
          <article className="mesh-card" key={a.id}>
            <div className="mesh-card-head">
              <strong>{a.name}</strong>
              <span className="mesh-status">{statusLabel(a)}</span>
            </div>
            <p className="mesh-caps">{a.capabilities.join(" · ")}</p>
            <div className="mesh-meta">
              <span>지연: {(a.latencyMs / 1000).toFixed(2)}s</span>
              <span>타입: {a.type}</span>
              <span>비용: {a.cost}</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-secondary">Connect</button>
              <button className="btn-primary">Use</button>
              <button className="btn-secondary">View Profile</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}

