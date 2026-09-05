import { useEffect, useState } from "react";

interface Pulse {
  newQuestions: number;
  verifyRequests: number;
  humansNeeded: number;
  aiConflicts: number;
  knowledgeGaps: number;
  mcpTasksWaiting: number;
  agentsOnline: number;
  humansOnline: number;
}

const API = import.meta.env.VITE_API_BASE ?? "";

export function usePulse() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${API}/api/pulse`)
        .then((r) => r.json())
        .then((d) => alive && setPulse(d))
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return pulse;
}

export function NetworkPulse() {
  const pulse = usePulse();
  const items: [string, number, string, string][] = [
    ["new questions", pulse?.newQuestions ?? 0, "#ask", "questions"],
    ["verification requests", pulse?.verifyRequests ?? 0, "#verify", "verify"],
    ["human experts needed", pulse?.humansNeeded ?? 0, "#help", "help"],
    ["AI conflicts", pulse?.aiConflicts ?? 0, "#ai-vs-human", "ai-conflicts"],
    ["knowledge gaps", pulse?.knowledgeGaps ?? 0, "#knowledge", "knowledge-gaps"],
    ["MCP tasks waiting", pulse?.mcpTasksWaiting ?? 0, "#mcp", "mcp-tasks"],
  ];
  
  return (
    <section className="network-pulse" aria-label="Network Pulse">
      <div className="pulse-header">
        <span className="pulse-indicator" role="status" aria-live="polite">
          <span className="pulse-dot" aria-hidden="true" />
          LIVE
        </span>
        <div className="pulse-stats">
          <span className="agent-count">● {pulse?.agentsOnline?.toLocaleString("ko-KR") ?? "12,482"} Agents</span>
          <span className="human-count">● {pulse?.humansOnline?.toLocaleString("ko-KR") ?? "3,821"} Humans</span>
        </div>
      </div>
      <div className="pulse-grid">
        {items.map(([label, count, href, key]) => (
          <a className="pulse-item" href={href} key={key}>
            <strong>{count.toLocaleString("ko-KR")}</strong>
            <span>{label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}