import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

interface Pulse {
  newQuestions: number;
  verifyRequests: number;
  humansNeeded: number;
  aiConflicts: number;
  knowledgeGaps: number;
  mcpTasksWaiting: number;
  agentsOnline: number;
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
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return pulse;
}

export function NetworkPulse() {
  const pulse = usePulse();
  // Each need routes to the feed that resolves it (§2: action-oriented pulse).
  const items: { label: string; count: number; to: string }[] = [
    { label: "새 질문", count: pulse?.newQuestions ?? 0, to: "/help-needed" },
    { label: "검증 요청", count: pulse?.verifyRequests ?? 0, to: "/verify" },
    { label: "인간 필요", count: pulse?.humansNeeded ?? 0, to: "/human-knowledge" },
    { label: "AI 충돌", count: pulse?.aiConflicts ?? 0, to: "/unsolved" },
    { label: "지식 갭", count: pulse?.knowledgeGaps ?? 0, to: "/teach-ai" },
  ];
  return (
    <section className="network-pulse" aria-label="Network Pulse">
      {items.map(({ label, count, to }) => (
        <Link className="pulse-item" to={to} key={label}>
          <strong>{count.toLocaleString("ko-KR")}</strong>
          <span>{label}</span>
        </Link>
      ))}
    </section>
  );
}
