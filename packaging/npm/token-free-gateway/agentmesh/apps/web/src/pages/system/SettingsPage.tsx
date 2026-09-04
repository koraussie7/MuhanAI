import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #10: Settings
// =====================================================================
const SETTINGS_SECTIONS = [
  "Account",
  "Privacy & Security",
  "AI Preferences",
  "Routing",
  "Models",
  "Network",
  "Token Bank & Reputation",
  "Agents & MCP",
  "API & Developer",
];

const ACTIVE_ROWS: Record<string, string[]> = {
  Account: ["이메일 알림", "주간 리포트", "2단계 인증 사용", "공개 프로필 표시"],
  "Privacy & Security": ["보안 알림", "외부 도구 연동 허용", "크레덴셜 볼트 자동 잠금"],
  "AI Preferences": ["자동 라우팅 사용", "AI 캐스트 자동 승인", "개인 모델 우선"],
  Routing: ["Free First 정책", "최저 비용 라우팅", "지역 노드 우선"],
  Models: ["웹 추론(WebLLM) 허용", "로컬 모델 자동 다운로드", "실험 모델 표시"],
  Network: ["P2P 연결", "WebRTC 릴레이", "자동 디스커버리", "GossipSub 구독"],
  "Token Bank & Reputation": ["크레딧 사용 내역 자동 정산", "평판 변동 알림"],
  "Agents & MCP": ["새 MCP 서버 자동 제안", "에이전트 자동 연결", "비신뢰 MCP 차단"],
  "API & Developer": ["API 키 자동 발급", "개발자 로그", "웹훅 전송"],
};

export function SettingsPage() {
  const [active, setActive] = useState<string>(
    SETTINGS_SECTIONS[0] ?? "Account",
  );
  return (
    <SpecPage title="Settings" subtitle="계정 · 개인정보 · AI · 네트워크 · 경제 · 개발자 설정">
      <div className="settings-layout">
        <nav className="settings-nav">
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s}
              className={
                s === active ? "settings-nav-item active" : "settings-nav-item"
              }
              onClick={() => setActive(s)}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {(ACTIVE_ROWS[active] ?? []).map((row) => (
            <div className="settings-row" key={row}>
              <span>{row}</span>
              <label className="switch">
                <input type="checkbox" defaultChecked={row.startsWith("사용")} />
                <i />
              </label>
            </div>
          ))}
        </div>
      </div>
    </SpecPage>
  );
}
