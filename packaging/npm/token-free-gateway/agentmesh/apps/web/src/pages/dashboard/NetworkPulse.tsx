import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useNetworkEvents } from "../../services/api";

interface Pulse {
  newQuestions: number;
  verifyRequests: number;
  humansNeeded: number;
  aiConflicts: number;
  knowledgeGaps: number;
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
  const { stats, connected } = useNetworkEvents();
  const pulse = usePulse();

  const agentsOnline = stats?.agentsOnline ?? 0;
  const totalAgents = stats?.totalAgents ?? 0;
  const avgLatencyMs = stats?.avgLatencyMs ?? 0;
  const items: { label: string; count: number; suffix: string; to: string }[] = [
    { label: "에이전트 온라인", count: agentsOnline, suffix: `/ ${totalAgents}`, to: "/agents" },
    { label: "평균 지연", count: avgLatencyMs, suffix: "ms", to: "/network-monitor" },
    { label: "새 질문", count: pulse?.newQuestions ?? 0, suffix: "", to: "/help-needed" },
    { label: "검증 요청", count: pulse?.verifyRequests ?? 0, suffix: "", to: "/verify" },
    { label: "인간 필요", count: pulse?.humansNeeded ?? 0, suffix: "", to: "/human-knowledge" },
  ];
  return (
    <section className="network-pulse" aria-label="Network Pulse">
      <div className="pulse-status">
        <span className={`pulse-dot ${connected ? "on" : "off"}`} />
        {connected ? "실시간" : "오프라인"}
      </div>
      {items.map(({ label, count, suffix, to }) => (
        <Link className="pulse-item" to={to} key={label}>
          <strong>{count.toLocaleString("ko-KR")}{suffix}</strong>
          <span>{label}</span>
        </Link>
      ))}
    </section>
  );
}
