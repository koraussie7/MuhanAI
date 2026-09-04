import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #6: Agents (mesh registry)
// =====================================================================
interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "busy";
  capabilities: string[];
  latencyMs: number;
  reputation: number;
  successRate: number;
  provider: string;
  model: string;
}

const STATUS_LABEL: Record<AgentInfo["status"], string> = {
  online: "● Online",
  offline: "○ Offline",
  busy: "◐ Busy",
};

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    load<AgentInfo[]>("/api/agents").then((d) => d && setAgents(d));
  }, []);

  const types = ["All", ...Array.from(new Set(agents.map((a) => a.type)))];
  const shown =
    filter === "All" ? agents : agents.filter((a) => a.type === filter);

  return (
    <SpecPage
      title="Agents"
      subtitle="1,284 Agents Online — capabilities · latency · reputation · success rate"
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
              <span className="mesh-status">{STATUS_LABEL[a.status]}</span>
            </div>
            <p className="mesh-caps">{a.capabilities.join(" · ")}</p>
            <div className="mesh-meta">
              <span>지연: {(a.latencyMs / 1000).toFixed(1)}s</span>
              <span>평판: {a.reputation}</span>
              <span>성공률: {a.successRate}%</span>
            </div>
            <div className="mesh-meta">
              <span>모델: {a.model}</span>
              <span>제공: {a.provider}</span>
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
