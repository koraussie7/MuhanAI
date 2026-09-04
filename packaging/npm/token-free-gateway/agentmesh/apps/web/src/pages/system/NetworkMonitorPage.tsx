import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

// ---- Network Monitor (live from /api/pulse + /api/network/stats) ----
export function NetworkMonitorPage() {
  const [pulse, setPulse] = useState<Record<string, number> | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  useEffect(() => {
    load<Record<string, number>>("/api/pulse").then((d) => d && setPulse(d));
    load<Record<string, unknown>>("/api/network/stats").then((d) => d && setStats(d));
  }, []);
  const grid: [string, string | number][] = stats
    ? [
        ["Agents Online", stats.agentsOnline],
        ["Human Agents", stats.humanAgents],
        ["LLM Providers", stats.llmProviders],
        ["MCP Servers", stats.mcpServers],
        ["Compute Nodes", stats.computeNodes],
        ["Knowledge", stats.knowledgeRecords],
        ["Requests/min", stats.requestsPerMin],
        ["Avg Latency", `${stats.avgLatencyMs}ms`],
      ]
    : [["상태", "연결 중…"]];
  return (
    <Page title="Network Monitor" subtitle="실시간 네트워크 상태">
      <StatGrid stats={grid} />
      {stats && (
        <div className="dash-block">
          <h3>활성 태스크</h3>
          <div className="spec-list">
            {Object.entries(stats.activeTasks ?? {}).map(([k, v]) => (
              <div className="kg-edge" key={k}>
                <span>{k}</span>
                <em>{String(v)}</em>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}

// ---- Agent Mesh ----
