/**
 * Autonomous Team Builder — 내 AI 팀 만들기.
 *
 * Migrated from `#team-builder` in the original index.html.
 *
 * The original toggled a class on the card element and then counted
 * `.team-agent-card.selected` from the DOM to update #selectedTeamCount. That
 * count is a derived value, so here it comes from state and the number can no
 * longer disagree with the cards. Defaults match the original: the first four
 * agents start selected.
 */

import { useState, type CSSProperties } from "react";

interface Agent {
  id: string;
  emoji: string;
  name: string;
  role: string;
  /** Selected by default, as on the original page. */
  defaultOn: boolean;
}

const AGENTS: readonly Agent[] = [
  {
    id: "CEO",
    emoji: "👑",
    name: "AI CEO",
    role: "총괄 전략 기획 & 자율 지휘",
    defaultOn: true,
  },
  {
    id: "Developer",
    emoji: "💻",
    name: "AI Developer",
    role: "웹사이트·API·기술 유지보수",
    defaultOn: true,
  },
  {
    id: "Marketer",
    emoji: "📢",
    name: "AI Marketer",
    role: "SNS 바이럴 & 콘텐츠 자동생성",
    defaultOn: true,
  },
  {
    id: "Support",
    emoji: "💬",
    name: "AI Customer Support",
    role: "24시간 고객 응대 & 자동 예약",
    defaultOn: true,
  },
  {
    id: "Sales",
    emoji: "🎯",
    name: "AI Sales",
    role: "고객 리드 발굴 & 맞춤 견적",
    defaultOn: false,
  },
  {
    id: "SEO",
    emoji: "🔍",
    name: "AI Agent SEO",
    role: "ChatGPT/Claude 검색 노출 최적화",
    defaultOn: false,
  },
  {
    id: "Accountant",
    emoji: "📊",
    name: "AI Accountant",
    role: "매출 집계 & 세무 기초 분석",
    defaultOn: false,
  },
  {
    id: "Researcher",
    emoji: "🔬",
    name: "AI Researcher",
    role: "경쟁사 모니터링 & 시장 트렌드",
    defaultOn: false,
  },
] as const;

const DEFAULT_SELECTED: ReadonlySet<string> = new Set(
  AGENTS.filter((a) => a.defaultOn).map((a) => a.id),
);

const headRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 12,
  borderBottom: "1px solid var(--border)",
  paddingBottom: 16,
};
const counterStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.85rem",
  color: "var(--primary)",
  background: "rgba(56, 189, 248, 0.1)",
  padding: "4px 12px",
  borderRadius: 9999,
};
const footRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 16,
  borderTop: "1px solid var(--border)",
  paddingTop: 20,
};
const nameStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "0.95rem",
  color: "#fff",
};
const roleStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
};

interface Props {
  onCreateTeam: () => void;
}

export function TeamBuilder({ onCreateTeam }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section id="team-builder" style={{ paddingTop: 40 }}>
      <div className="section-head">
        <div className="section-tag">Autonomous Team Builder</div>
        <h2 className="section-title">내 AI 팀 만들기</h2>
        <p className="section-desc">
          "단순한 AI 직원이 아니라, 내 비즈니스를 움직이는 AI 전담 팀을
          구성하세요."
          <br />
          필요한 Agent만 선택하여 맞춤형 자율 비즈니스 팀을 완성합니다.
        </p>
      </div>

      <div className="team-picker-container">
        <div style={headRowStyle}>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>
              👥 비즈니스 전담 AI Agent 선택
            </h3>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              원하는 직무 에이전트를 클릭하여 활성화하세요
            </p>
          </div>
          <div style={counterStyle}>
            <span id="selectedTeamCount">{selected.size}</span>개 에이전트
            선택됨
          </div>
        </div>

        <div className="team-grid">
          {AGENTS.map((agent) => {
            const on = selected.has(agent.id);
            return (
              <div
                key={agent.id}
                className={`team-agent-card${on ? " selected" : ""}`}
                // A div, not a button, to keep the original markup and CSS.
                // role/tabIndex are what make it reachable by keyboard.
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${agent.name} — ${agent.role}`}
                onClick={() => toggle(agent.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(agent.id);
                  }
                }}
              >
                <div className="team-custom-check">✓</div>
                <div>
                  <div style={nameStyle}>
                    {agent.emoji} {agent.name}
                  </div>
                  <div style={roleStyle}>{agent.role}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={footRowStyle}>
          <div style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>
            💡 <strong>AI Business Starter(₩29,000)</strong> 생성 시 기본 팀이
            자동 연동되며 언제든 추가 가능합니다.
          </div>
          <button
            type="button"
            onClick={onCreateTeam}
            className="btn-primary"
            style={{ padding: "12px 28px", fontSize: "0.95rem" }}
          >
            ⚡ 내 맞춤 AI 팀 생성하기
          </button>
        </div>
      </div>
    </section>
  );
}
