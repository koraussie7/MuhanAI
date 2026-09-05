import { useState, useEffect } from "react";

const API = "";

interface PulseData {
  newQuestions: number;
  verifyRequests: number;
  humansNeeded: number;
  aiConflicts: number;
  knowledgeGaps: number;
  mcpTasksWaiting: number;
  agentsOnline?: number;
  humansOnline?: number;
}

const DEFAULT_PULSE: PulseData = {
  newQuestions: 14,
  verifyRequests: 8,
  humansNeeded: 5,
  aiConflicts: 3,
  knowledgeGaps: 6,
  mcpTasksWaiting: 12,
  agentsOnline: 12_482,
  humansOnline: 3_821,
};

export function NetworkPulse() {
  const [pulse, setPulse] = useState<PulseData>(DEFAULT_PULSE);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const loadPulse = async () => {
      try {
        const res = await fetch(`${API}/api/pulse`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setPulse({ ...DEFAULT_PULSE, ...data });
        }
      } catch {
        // Fallback to defaults
      } finally {
        clearTimeout(timeout);
      }
    };

    loadPulse();
    const interval = setInterval(loadPulse, 10000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  const items = [
    ["new questions", pulse.newQuestions, "badge-cyan"],
    ["verification requests", pulse.verifyRequests, "badge-amber"],
    ["human experts needed", pulse.humansNeeded, "badge-rose"],
    ["AI conflicts", pulse.aiConflicts, "badge-violet"],
    ["knowledge gaps", pulse.knowledgeGaps, "badge-amber"],
    ["MCP tasks waiting", pulse.mcpTasksWaiting, "badge-cyan"],
  ] as const;

  return (
    <div className="network-pulse">
      <div className="pulse-header">
        <span className="pulse-dot" />
        <span className="pulse-title">NETWORK PULSE</span>
        <span className="pulse-subtitle">
          (agents online: {pulse.agentsOnline?.toLocaleString("ko-KR") ?? "12,482"} · human:{" "}
          {pulse.humansOnline?.toLocaleString("ko-KR") ?? "3,821"})
        </span>
      </div>
      <div className="pulse-items">
        {items.map(([label, count, badgeClass]) => (
          <span key={label} className="pulse-item">
            <span className={`pulse-badge ${badgeClass}`}>{count}</span>
            <span className="pulse-label">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
