// apps/web/src/components/ForecastLedger.tsx
// P2PCLAW Forecast Ledger — LocalCrab claims from Pythia forecasts
import { useEffect, useState } from "react";
import type { PythiaForecast, ForecastConfidence } from "@knowledge-base/visuals/pythia-types";
import { ConsensusDial } from "./visuals/ConsensusDial";

const API = import.meta.env.VITE_API_BASE ?? "";

const CONFIDENCE_BADGE = {
  low: "badge-ghost",
  medium: "badge-warning",
  high: "badge-success",
  certain: "badge-info",
} as const;

export function ForecastLedger() {
  const [forecasts, setForecasts] = useState<PythiaForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"pending" | "resolved" | "all">("pending");

  useEffect(() => {
    let cancelled = false;

    const loadForecasts = async () => {
      const status = selectedTab === "all" ? "" : selectedTab;
      const url = status
        ? `${API}/api/p2pclaw/forecasts?status=${status}`
        : `${API}/api/p2pclaw/forecasts`;

      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const data: PythiaForecast[] = await resp.json();
          if (!cancelled) setForecasts(data);
        }
      } catch {
        if (!cancelled) {
          // Demo data
          setForecasts([
            {
              forecastId: "fc-demo-1",
              agentId: "claude-thin-client",
              createdAt: new Date().toISOString(),
              hypothesis: "Will GLM-5.2 achieve >20 tokens/sec in browser WASM?",
              outcome: ">20 tokens/sec achievable with 4 Web Workers",
              confidence: "high",
              confidenceNumeric: 0.85,
              horizon: "7d",
              supportingEvents: ["evt-001", "evt-002"],
              citations: [],
              localcrabClaimId: "claim-12345",
            },
            {
              forecastId: "fc-demo-2",
              agentId: "agent-gemini",
              createdAt: new Date(Date.now() - 86400000).toISOString(),
              hypothesis: "Will P2P chunk replication reach 1000 chunks across 14 agents?",
              outcome: "Yes — 1488 chunks cached network-wide",
              confidence: "certain",
              confidenceNumeric: 1.0,
              horizon: "30d",
              supportingEvents: ["evt-010", "evt-015"],
              citations: [],
              localcrabClaimId: "claim-12346",
            },
            {
              forecastId: "fc-demo-3",
              agentId: "agent-local",
              createdAt: new Date(Date.now() - 172800000).toISOString(),
              hypothesis: "Can browser-based Colibri handle 744B parameter inference?",
              outcome: "No — requires Fellowship node with 256MB+ WASM heap",
              confidence: "medium",
              confidenceNumeric: 0.65,
              resolvedAt: new Date(Date.now() - 86400000).toISOString(),
              horizon: "14d",
              supportingEvents: ["evt-020"],
              citations: [],
              localcrabClaimId: "claim-12347",
            },
          ]);
        }
      }
      if (!cancelled) setLoading(false);
    };

    loadForecasts();
    const interval = setInterval(loadForecasts, 15000);
    return () => {
      if (!cancelled) clearInterval(interval);
    };
  }, [selectedTab]);

  const pendingCount = forecasts.filter((f) => !f.resolvedAt).length;
  const resolvedCount = forecasts.filter((f) => f.resolvedAt).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Forecast Ledger</h1>
        <div className="badge badge-primary">LocalCrab Claims</div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Total Claims</div>
            <div className="stat-value">{forecasts.length}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Pending</div>
            <div className="stat-value text-warning">{pendingCount}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Resolved</div>
            <div className="stat-value text-success">{resolvedCount}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Avg Confidence</div>
            <div className="stat-value">
              {forecasts.length > 0
                ? `${Math.round((forecasts.reduce((s, f) => s + (f.confidenceNumeric ?? 0.5), 0) / forecasts.length) * 100)}%`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2">
        <button
          type="button"
          className={`btn btn-sm ${selectedTab === "pending" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setSelectedTab("pending")}
        >
          Pending ({pendingCount})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${selectedTab === "resolved" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setSelectedTab("resolved")}
        >
          Resolved ({resolvedCount})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${selectedTab === "all" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setSelectedTab("all")}
        >
          All ({forecasts.length})
        </button>
      </div>

      {/* Forecast List */}
      <div className="space-y-4">
        {loading ? (
          <p className="dash-note">Loading forecasts…</p>
        ) : forecasts.length === 0 ? (
          <p className="dash-note">No forecasts found.</p>
        ) : (
          forecasts.map((forecast) => (
            <div key={forecast.forecastId} className="card bg-base-200 shadow-xl">
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="card-title">{forecast.hypothesis}</h3>
                      <span className={`badge ${CONFIDENCE_BADGE[forecast.confidence]} badge-sm`}>
                        {forecast.confidence}
                      </span>
                      {forecast.resolvedAt && (
                        <span className="badge badge-success badge-sm">Resolved</span>
                      )}
                    </div>
                    <p className="text-lg">→ {forecast.outcome}</p>

                    <div className="flex items-center gap-4 mt-2 text-sm text-base-content/70">
                      <span>Agent: {forecast.agentId}</span>
                      {forecast.horizon && <span>Horizon: {forecast.horizon}</span>}
                      {forecast.confidenceNumeric !== undefined && (
                        <span>Confidence: {(forecast.confidenceNumeric * 100).toFixed(0)}%</span>
                      )}
                    </div>

                    {forecast.supportingEvents.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs text-base-content/50">
                          Supporting evidence: {forecast.supportingEvents.length} events
                        </span>
                      </div>
                    )}

                    {forecast.localcrabClaimId && (
                      <div className="mt-2">
                        <span className="text-xs text-base-content/50">
                          LocalCrab claim: {forecast.localcrabClaimId.substring(0, 16)}…
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Consensus Dial for confidence visualization */}
                  <div className="ml-4">
                    <ConsensusDial
                      value={forecast.confidenceNumeric ?? 0.5}
                      label={forecast.confidence}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
