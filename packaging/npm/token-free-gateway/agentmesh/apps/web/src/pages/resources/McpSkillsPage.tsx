import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #7: MCP / Skills
// =====================================================================
interface McpServer {
  id: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  users: number;
  tools: number;
  latencyMs: number;
  reliability: number;
  tags: string[];
}

export function McpSkillsPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    load<McpServer[]>("/api/mcp").then((d) => d && setServers(d));
  }, []);

  async function install(id: string) {
    setInstalled((prev) => new Set(prev).add(id));
  }

  return (
    <SpecPage
      title="MCP / Skills"
      subtitle="4,821 servers · 12,400 tools · 42 categories — MCP는 AI의 능력 확장 표준"
    >
      <div className="spec-grid">
        {servers.map((s) => (
          <article className="spec-card" key={s.id}>
            <div className="spec-card-head">
              <span className="spec-kind mcp">{s.category}</span>
              <span className="spec-rating">★ {s.rating}</span>
            </div>
            <h3>{s.name}</h3>
            <p>{s.description}</p>
            <div className="spec-card-meta">
              <span>👥 {s.users.toLocaleString("ko-KR")}</span>
              <span>🛠 {s.tools} tools</span>
              <span>⏱ {s.latencyMs}ms</span>
              <span>📈 신뢰 {s.reliability}%</span>
            </div>
            <div className="mesh-actions">
              <button
                className="btn-secondary"
                disabled={installed.has(s.id)}
                onClick={() => install(s.id)}
              >
                {installed.has(s.id) ? "Installed ✓" : "Install"}
              </button>
              <button className="btn-primary">Connect</button>
              <button className="btn-secondary">Test</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}
