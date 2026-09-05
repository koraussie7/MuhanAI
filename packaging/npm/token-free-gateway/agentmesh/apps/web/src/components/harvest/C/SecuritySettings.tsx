import React, { useState } from "react";

/**
 * SecuritySettings — tkngate security/gateway model (Apache-2.0 pattern adaption).
 * tkngate ships a Go CLI (no React source available); this adapts its
 * zero-trust provider/budget/policy model into a settings UI.
 */
export function SecuritySettings() {
  const [zeroTrust, setZeroTrust] = useState(true);
  const [budgetGuard, setBudgetGuard] = useState(true);
  const [relayEncrypt, setRelayEncrypt] = useState(true);
  const [apiVault, setApiVault] = useState(false);
  return (
    <Page title="Security & Settings" subtitle="Zero-trust gateway · API vault · budget guard">
      <div className="hc-settings">
        <section className="hc-settings-section">
          <h3>Zero Trust Gateway</h3>
          <div className="hc-toggle-row">
            <div>
              <strong>게이트웨이 활성화</strong>
              <p>모든 LLM 호출을 정책 체인을 통과시킵니다.</p>
            </div>
            <button
              className={`hc-toggle ${zeroTrust ? "on" : ""}`}
              onClick={() => setZeroTrust((v) => !v)}
              aria-pressed={zeroTrust}
            >
              <span className="hc-toggle-knob" />
            </button>
          </div>
          <div className="hc-toggle-row">
            <div>
              <strong>릴레이 암호화</strong>
              <p>피어 간 메시지를 E2E 암호화합니다.</p>
            </div>
            <button
              className={`hc-toggle ${relayEncrypt ? "on" : ""}`}
              onClick={() => setRelayEncrypt((v) => !v)}
              aria-pressed={relayEncrypt}
            >
              <span className="hc-toggle-knob" />
            </button>
          </div>
        </section>
        <section className="hc-settings-section">
          <h3>Budget Guard</h3>
          <div className="hc-toggle-row">
            <div>
              <strong>예산 가드</strong>
              <p>일일 크레딧 한도를 초과하면 유료 API를 차단합니다.</p>
            </div>
            <button
              className={`hc-toggle ${budgetGuard ? "on" : ""}`}
              onClick={() => setBudgetGuard((v) => !v)}
              aria-pressed={budgetGuard}
            >
              <span className="hc-toggle-knob" />
            </button>
          </div>
          <div className="hc-settings-field">
            <label>일일 한도 (cr)</label>
            <input type="number" defaultValue={5000} className="hc-settings-input" />
          </div>
        </section>
        <section className="hc-settings-section">
          <h3>API Vault</h3>
          <div className="hc-toggle-row">
            <div>
              <strong>키 보관소</strong>
              <p>API 키를 암호화하여 로컬에 저장합니다.</p>
            </div>
            <button
              className={`hc-toggle ${apiVault ? "on" : ""}`}
              onClick={() => setApiVault((v) => !v)}
              aria-pressed={apiVault}
            >
              <span className="hc-toggle-knob" />
            </button>
          </div>
          <ul className="hc-vault-keys">
            {["gemini-prod", "anthropic-main", "openrouter-backup"].map((key) => (
              <li key={key} className="hc-vault-key">
                <span className="hc-vault-name">{key}</span>
                <span className="hc-vault-sk">sk-****{Math.random().toString(36).slice(2, 6)}</span>
                <button className="hc-vault-revoke">폐기</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}

function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dash-page">
      <header className="dash-page-header">
        <h2>{title}</h2>
        {subtitle && <p className="dash-page-subtitle">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}
