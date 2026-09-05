import React from "react";

/**
 * GatewayPanel — adapted from tkngate zero-trust gateway concepts
 * (Apache-2.0): provider health table + policy chain visualization.
 * tkngate ships a Go CLI (no React source), so this adapts its
 * provider/policy/budget model rather than copying UI code.
 */
export interface GatewayProvider {
  name: string;
  status: "healthy" | "degraded" | "offline";
  latencyMs: number;
  costTier: "free" | "low" | "paid";
}

export function GatewayTable({ providers }: { providers: GatewayProvider[] }) {
  return (
    <section className="hc-panel">
      <h3 className="hc-panel-title">Zero-Trust Gateway</h3>
      <table className="hc-gateway-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>상태</th>
            <th>지연</th>
            <th>비용 등급</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.name} className={`hc-gateway-row ${p.status}`}>
              <td className="hc-gateway-name">{p.name}</td>
              <td>
                <span className={`hc-status-dot ${p.status === "healthy" ? "idle" : p.status === "degraded" ? "warm" : "offline"}`} />
                <span className="hc-gateway-status">{p.status}</span>
              </td>
              <td className="hc-gateway-latency">{p.latencyMs}ms</td>
              <td>
                <span className={`hc-cost-tier ${p.costTier}`}>{p.costTier}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function PolicyChain({ chain }: { chain: string[] }) {
  return (
    <section className="hc-panel">
      <h3 className="hc-panel-title">Policy Chain</h3>
      <ol className="hc-policy-chain">
        {chain.map((step, i) => (
          <li key={i} className="hc-policy-step">
            <span className="hc-policy-index">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * ApiVault — API key / quota vault summary (tkngate budget model).
 */
export function ApiVault({ entries }: { entries: { name: string; quota: number; used: number }[] }) {
  return (
    <section className="hc-panel">
      <h3 className="hc-panel-title">API Vault</h3>
      <ul className="hc-vault-list">
        {entries.map((entry) => {
          const pct = entry.quota > 0 ? Math.round((entry.used / entry.quota) * 100) : 0;
          return (
            <li key={entry.name} className="hc-vault-item">
              <div className="hc-dispatch-head">
                <span>{entry.name}</span>
                <span className="hc-vault-quota">
                  {entry.used}/{entry.quota} ({pct}%)
                </span>
              </div>
              <div className="hc-load-bar">
                <div
                  className={`hc-load-bar-fill ${pct > 85 ? "hot" : pct > 60 ? "warm" : "cool"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
