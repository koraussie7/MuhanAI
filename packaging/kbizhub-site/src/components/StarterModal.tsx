/**
 * Starter order modal — "내 AI 비즈니스 노드 생성".
 *
 * Migrated from `#starterModal` in the original index.html, which was driven by
 * three globals: openStarterModal/closeStarterModal toggled a class on the
 * backdrop, and submitStarterOrder wrote straight to the DOM (hid the form,
 * showed #orderSuccess). Here the visibility and the success state are React
 * state, so both survive re-renders and neither reaches into the DOM.
 *
 * Markup, classes and colours are carried over unchanged.
 */

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { submitStarterOrder, type StarterOrder } from "../lib/orders";

const INDUSTRIES = [
  { value: "restaurant", label: "식당 / 카페 / F&B" },
  { value: "ecommerce", label: "온라인 쇼핑몰" },
  { value: "professional", label: "전문직 (법률/세무)" },
  { value: "service", label: "생활 서비스 / 뷰티" },
  { value: "tech", label: "IT 스타트업" },
  { value: "creator", label: "1인 크리에이터" },
  { value: "other", label: "기타 비즈니스" },
] as const;

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 700,
  marginBottom: 3,
  color: "#cbd5e1",
};
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "0.85rem",
};
const selectStyle: CSSProperties = {
  width: "100%",
  background: "#0f172a",
  color: "#fff",
  padding: "8px 12px",
  fontSize: "0.85rem",
};
const priceBoxStyle: CSSProperties = {
  background: "rgba(56, 189, 248, 0.08)",
  border: "1px solid var(--border-accent)",
  borderRadius: 8,
  padding: "9px 12px",
  marginTop: 2,
};
const successStyle: CSSProperties = {
  background: "rgba(16, 185, 129, 0.15)",
  border: "1px solid #10b981",
  borderRadius: 12,
  padding: 18,
  textAlign: "center",
  marginTop: 18,
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful write, for the host page to react to. */
  onSubmitted?: (order: StarterOrder) => void;
}

export function StarterModal({ open, onClose, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Escape closes. The original relied on the backdrop click only, which left
  // keyboard users stuck inside an overlay they could not dismiss.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset on close so reopening starts from the form, not the success panel.
  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const form = new FormData(e.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const order = await submitStarterOrder(form);
      setSubmitted(true);
      onSubmitted?.(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "주문에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      id="starterModal"
      className="modal-backdrop active"
      onClick={(e) => {
        // Only a click on the backdrop itself closes — not one that bubbled
        // up from inside the box.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <span className="modal-close" onClick={onClose} aria-hidden="true">
          ×
        </span>
        <div
          style={{
            fontSize: "0.8rem",
            fontFamily: "var(--font-mono)",
            color: "var(--primary)",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          🚀 AI BUSINESS STARTER · ₩29,000
        </div>
        <h3
          style={{
            fontSize: "1.35rem",
            fontWeight: 800,
            color: "#fff",
            marginBottom: 6,
          }}
        >
          내 AI 비즈니스 노드 생성
        </h3>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            marginBottom: 16,
            lineHeight: 1.4,
          }}
        >
          기본 사업 정보를 입력하시면 웹사이트, AI Agent, MCP 및 MuhanAI
          네트워크가 원스톱으로 구성됩니다.
        </p>

        {submitted ? (
          <div id="orderSuccess" style={successStyle}>
            <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>🎉</div>
            <h4 style={{ fontSize: "1.1rem", color: "#fff", fontWeight: 800 }}>
              AI Business Node 생성 요청 완료!
            </h4>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#cbd5e1",
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              입력하신 이메일로 비즈니스 관리 대시보드(MY AI BUSINESS) 접속
              링크와 초기 Agent 설정 가이드가 발송되었습니다.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            id="orderForm"
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <label style={labelStyle} htmlFor="orderBizName">
                  사업체 / 브랜드 이름 *
                </label>
                <input
                  type="text"
                  id="orderBizName"
                  name="bizName"
                  required
                  placeholder="예: 다낭 한식당, 강남 세무회계"
                  className="waitlist-input"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="orderIndustry">
                  업종 카테고리 *
                </label>
                <select
                  id="orderIndustry"
                  name="industry"
                  required
                  defaultValue={INDUSTRIES[0].value}
                  className="waitlist-input"
                  style={selectStyle}
                >
                  {INDUSTRIES.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle} htmlFor="orderEmail">
                대표자 이메일 주소 *
              </label>
              <input
                type="email"
                id="orderEmail"
                name="email"
                required
                placeholder="ceo@mybiz.com"
                className="waitlist-input"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle} htmlFor="orderWebsite">
                기존 웹사이트 URL (선택사항, 없을 시 AI가 신규 생성)
              </label>
              <input
                type="url"
                id="orderWebsite"
                name="website"
                placeholder="https://mybiz.com"
                className="waitlist-input"
                style={inputStyle}
              />
            </div>

            <div style={priceBoxStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  color: "#fff",
                }}
              >
                <span>AI Business Node 평생 등록비:</span>
                <span
                  style={{
                    color: "var(--primary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.1rem",
                  }}
                >
                  ₩29,000
                </span>
              </div>
              <div
                style={{
                  fontSize: "0.74rem",
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                ✓ 웹사이트 + AI Agent + MCP + MuhanAI 네트워크 연동 평생 소유
              </div>
            </div>

            {error && (
              <p
                role="alert"
                data-testid="starter-order-error"
                style={{ fontSize: "0.8rem", color: "#f43f5e", margin: 0 }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={submitting}
              style={{
                padding: 11,
                fontSize: "0.95rem",
                width: "100%",
                marginTop: 4,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting
                ? "처리 중…"
                : "💳 29,000원으로 AI 비즈니스 즉시 생성하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
