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
  const items: [string, number, string][] = [
    ["새 질문", pulse?.newQuestions ?? 0, "#ask"],
    ["검증 요청", pulse?.verifyRequests ?? 0, "#verify"],
    ["인간 필요", pulse?.humansNeeded ?? 0, "#help"],
    ["AI 충돌", pulse?.aiConflicts ?? 0, "#help"],
  ];
  return (
    <section className="network-pulse" aria-label="Network Pulse">
      {items.map(([label, count, href]) => (
        <a className="pulse-item" href={href} key={label}>
          <strong>{count.toLocaleString("ko-KR")}</strong>
          <span>{label}</span>
        </a>
      ))}
    </section>
  );
}
