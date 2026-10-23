/**
 * Message Center — 예약 한 건이 알림톡 한 통이 됩니다.
 *
 * Migrated from `#message-center` in the original index.html. Copy, classes and
 * inline styles are carried over unchanged so the visual output is identical;
 * only `onclick="openStarterModal()"` became a prop, since the modal is now
 * owned by this track rather than a global function.
 */

const FEATURES = [
  {
    icon: "💬",
    title: "카카오 알림톡",
    body: "승인된 템플릿으로 예약 확인·주문 접수·배송 안내를 발송합니다. 정보성 메시지라 광고 차단 정책의 영향을 받지 않습니다.",
  },
  {
    icon: "📱",
    title: "SMS / LMS / MMS",
    body: "단문·장문·이미지 문자를 함께 씁니다. 알림톡 전송이 실패하면 replaceSms 설정으로 문자에 자동 대체 발송됩니다.",
  },
  {
    icon: "⏰",
    title: "예약 발송",
    body: "scheduleType: SCHEDULED 으로 방문 하루 전 리마인드를 미리 예약해 둘 수 있습니다. Agent가 판단해 스스로 발송을 큐에 넣습니다.",
  },
  {
    icon: "🔐",
    title: "자격증명 자동 관리",
    body: "accessKey·secretKey 는 50분 캐시 토큰으로 자동 발급·갱신되며 401/403 시 재발송합니다. 키를 코드에 새기지 않습니다.",
  },
] as const;

const STEPS = [
  { icon: "📥", title: "1. 예약 접수", sub: "Agent 또는 MCP 엔드포인트" },
  { icon: "🧠", title: "2. 템플릿 매칭", sub: "승인된(APR) 템플릿 선택" },
  { icon: "💬", title: "3. 알림톡 발송", sub: "Sendgo 공식 API" },
  { icon: "🛡️", title: "4. 실패 시 문자 대체", sub: "도달률 보장" },
] as const;

const stepTitleStyle = {
  fontWeight: 800,
  fontSize: "0.92rem",
  color: "var(--primary)",
} as const;
const stepSubStyle = {
  fontSize: "0.76rem",
  color: "var(--text-muted)",
  marginTop: 2,
} as const;

interface Props {
  onActivate: () => void;
}

export function MessageCenter({ onActivate }: Props) {
  return (
    <section id="message-center" style={{ paddingTop: 50 }}>
      <div className="section-head">
        <div className="section-tag">Message Center</div>
        <h2 className="section-title">예약 한 건이 알림톡 한 통이 됩니다</h2>
        <p className="section-desc">
          AI Agent가 접수한 예약·주문을 카카오 알림톡과 문자로 고객에게 즉시
          안내합니다. <strong>Sendgo 공식 OpenAPI</strong> 기반이라 발송
          이력·실패 통계·대체 발송까지 한 화면에서 관리합니다.
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

      {/* 발송 워크플로우 */}
      <div className="pipeline-track" style={{ marginTop: 30 }}>
        {STEPS.map((s) => (
          <div className="pipeline-step" key={s.title}>
            <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>{s.icon}</div>
            <div style={stepTitleStyle}>{s.title}</div>
            <div style={stepSubStyle}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 26 }}>
        <button
          type="button"
          onClick={onActivate}
          className="btn-primary"
          style={{ padding: "12px 26px", fontSize: "0.9rem" }}
        >
          💬 메시지 센터 활성화하기
        </button>
      </div>
    </section>
  );
}
