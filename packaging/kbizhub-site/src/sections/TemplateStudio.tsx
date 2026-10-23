/**
 * Template Studio — 반려당하기 전에 알아채는 템플릿 작업대.
 *
 * Migrated from `#template-studio` in the original index.html. Copy, classes
 * and inline styles carried over unchanged; only the CTA became a prop.
 */

import type { CSSProperties } from "react";

const FEATURES = [
  {
    icon: "✍️",
    title: "템플릿 작성",
    body: "변수는 #{name} 형태로 본문에 넣습니다. 기본형(BA)·부가정보형(EX)·채널추가형(AD)·복합형(MI) 중 목적에 맞는 유형을 고릅니다.",
  },
  {
    icon: "✅",
    title: "정책 사전 검증",
    body: "messagePurpose·legalBasis·optInReviewConfirmed 등 정책 필드가 본문과 어긋나면 저장 단계에서 POLICY_VALIDATION_FAILED 로 즉시 차단됩니다.",
  },
  {
    icon: "📋",
    title: "검수 요청·추적",
    body: "검수는 비동기입니다. REG → REQ → APR / REJ 상태를 폴링으로 추적하고, 승인된 템플릿만 발송에 쓸 수 있습니다.",
  },
  {
    icon: "🗂️",
    title: "폴더 관리",
    body: "최대 5단계 폴더로 주문 안내·배송 안내를 분류합니다. 알림톡과 브랜드메시지가 폴더를 공유하며, 미분류는 folderUuid: none 으로 조회합니다.",
  },
] as const;

const STEPS = [
  { icon: "✍️", title: "1. 작성", sub: "REG (등록)" },
  { icon: "🛡️", title: "2. 정책 검증", sub: "즉시 피드백" },
  { icon: "📤", title: "3. 검수 요청", sub: "REQ (심사 대기)" },
  { icon: "🎉", title: "4. 승인", sub: "APR — 발송 가능" },
] as const;

const NOTES = [
  "카카오 채널이 카카오 측에서 차단되면 발송이 조용히 실패합니다. sync() 를 주기적으로 돌려 block: true 채널을 감시하세요.",
  "본문을 수정하면 재검수가 필요합니다. 승인받은 문안은 가급적 그대로 유지하고 변수만 바꾸세요.",
  '심사가 붙는 작업은 비동기입니다. 등록이 성공했다는 건 "접수됐다"는 뜻이지 "쓸 수 있다"는 뜻이 아닙니다.',
] as const;

const stepTitleStyle: CSSProperties = {
  fontWeight: 800,
  fontSize: "0.92rem",
  color: "var(--primary)",
};
const stepSubStyle: CSSProperties = {
  fontSize: "0.76rem",
  color: "var(--text-muted)",
  marginTop: 2,
};
const notePanelStyle: CSSProperties = {
  marginTop: 30,
  background: "var(--bg-card)",
  border: "1px solid var(--border-accent)",
  borderRadius: 16,
  padding: "22px 24px",
};
const noteHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
};
const noteListStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  color: "var(--text-muted)",
  fontSize: "0.9rem",
  lineHeight: 1.9,
};

interface Props {
  onOpenStudio: () => void;
}

export function TemplateStudio({ onOpenStudio }: Props) {
  return (
    <section id="template-studio" style={{ paddingTop: 50 }}>
      <div className="section-head">
        <div className="section-tag">Template Studio</div>
        <h2 className="section-title">
          반려당하기 전에 알아채는 템플릿 작업대
        </h2>
        <p className="section-desc">
          카카오 알림톡은 <strong>사전 승인</strong> 없인 발송 자체가
          불가합니다. Sendgo 정책 필드를 저장 단계에서 먼저 검증하므로, 며칠
          기다렸다 반려당하는 일을 막습니다. 반려 사유는 한국어로 그대로
          전달됩니다.
        </p>
      </div>

      <div className="card-grid-4">
        {FEATURES.map((f) => (
          <div className="feat-card" key={f.title}>
            <div className="feat-icon">{f.icon}</div>
            <h3 className="feat-title">{f.title}</h3>
            <p className="feat-desc">{f.body}</p>
          </div>
        ))}
      </div>

      {/* 검수 라이프사이클 */}
      <div className="pipeline-track" style={{ marginTop: 30 }}>
        {STEPS.map((s) => (
          <div className="pipeline-step" key={s.title}>
            <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>{s.icon}</div>
            <div style={stepTitleStyle}>{s.title}</div>
            <div style={stepSubStyle}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 운영자 주의사항 */}
      <div style={notePanelStyle}>
        <div style={noteHeadStyle}>
          <span style={{ fontSize: "1.2rem" }}>ℹ️</span>
          <strong style={{ fontSize: "1rem" }}>알아두면 좋은 세 가지</strong>
        </div>
        <ul style={noteListStyle}>
          {NOTES.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      </div>

      <div style={{ textAlign: "center", marginTop: 26 }}>
        <button
          type="button"
          onClick={onOpenStudio}
          className="btn-primary"
          style={{ padding: "12px 26px", fontSize: "0.9rem" }}
        >
          ✍️ 템플릿 스튜디오 열기
        </button>
      </div>
    </section>
  );
}
