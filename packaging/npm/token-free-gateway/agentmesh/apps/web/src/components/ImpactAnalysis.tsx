// apps/web/src/components/ImpactAnalysis.tsx
// P2PCLAW Impact Analysis — impact tiers visualization on claims/forecasts
import { useEffect, useState } from "react";
import type { ImpactAnalysis, ImpactTier, PythiaForecast, PythiaEvent } from "@knowledge-base/visuals/pythia-types";
import { ConsensusDial } from "./visuals/ConsensusDial";
import { SwarmRadar } from "./visuals/SwarmRadar";

const API = import.meta.env.VITE_API_BASE ?? "";

const TIER_COLORS: Record<ImpactTier, { badge: string; bg: string; text: string }> = {
  low: { badge: "badge-ghost", bg: "bg-base-100", text: "text-base-content/70" },
  medium: { badge: "badge-warning", bg: "bg-warning/10", text: "text-warning" },
  high: { badge: "badge-error", bg: "bg-error/10", text: "text-error" },
  critical: { badge: "badge-error", bg: "bg-error/20", text: "text-error" },
};

const TIER_ICONS: Record<ImpactTier, string> = {
  low: "🟢",
  medium: "🟡",
  high: "🟠",
  critical: "🔴",
};

export function ImpactAnalysis() {
  const [impacts, setImpacts] = useState<ImpactAnalysis[]>([]);
  const [forecasts, setForecasts] = useState<PythiaForecast[]>([]);
  const [events, setEvents] = useState<PythiaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<ImpactTier | "all">("all");

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [impactsResp, forecastsResp, eventsResp] = await Promise.all([
          fetch(`${API}/api/p2pclaw/impacts`),
          fetch(`${API}/api/p2pclaw/forecasts`),
          fetch(`${API}/api/p2pclaw/events?limit=50`),
        ]);

        if (!cancelled) {
          if (impactsResp.ok) setImpacts(await impactsResp.json());
          if (forecastsResp.ok) setForecasts(await forecastsResp.json());
          if (eventsResp.ok) setEvents(await eventsResp.json());
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          // Demo data
          setImpacts([
            {
              targetId: "fc-demo-1",
              targetType: "forecast",
              tier: "high",
              score: 0.85,
              affectedAgents: ["claude-thin-client", "agent-gemini", "agent-local"],
              affectedDomains: ["inference", "memory"],
              rationale: "High confidence forecast requires multi-agent validation",
              mitigations: ["Add fellowship node redundancy", "Increase WASM heap"],
              generatedBy: "impact-analyzer",
              generatedAt: new Date().toISOString(),
            },
            {
              targetId: "evt-003",
              targetType: "event",
              tier: "critical",
              score: 0.92,
              affectedAgents: ["agent-local", "browser-node-1", "browser-node-2"],
              affectedDomains: ["memory", "wasm"],
              rationale: "Browser WASM heap approaching limit, risking inference failure",
              mitigations: ["Offload to fellowship node", "Reduce batch size", "Enable streaming"],
              generatedBy: "impact-analyzer",
              generatedAt: new Date().toISOString(),
            },
            {
              targetId: "fc-demo-2",
              targetType: "forecast",
              tier: "medium",
              score: 0.55,
              affectedAgents: ["agent-gemini"],
              affectedDomains: ["p2p"],
              rationale: "Moderate confidence, single agent prediction",
              mitigations: ["Seek multi-agent consensus"],
              generatedBy: "impact-analyzer",
              generatedAt: new Date().toISOString(),
            },
          ]);
          setForecasts([
            { forecastId: "fc-demo-1", agentId: "claude-thin-client", hypothesis: "Q", outcome: "A", confidence: "high", confidenceNumeric: 0.85, supportingEvents: [] },
            { forecastId: "fc-demo-2", agentId: "agent-gemini", hypothesis: "Q", outcome: "A", confidence: "medium", confidenceNumeric: 0.55, supportingEvents: [] },
          ]);
          setEvents([
            { eventId: "evt-003", sourceAgent: "agent-local", kind: "verification", severity: "critical", title: "Memory pressure", body: "WASM heap limit", timestamp: new Date().toISOString(), metadata: {} },
          ]);
          setLoading(false);
        }
      }
    };

    loadData();
    const interval = setInterval(loadData, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const filteredImpacts = selectedTier === "all"
    ? impacts
    : impacts.filter((i) => i.tier === selectedTier);

  const tierCounts = impacts.reduce(
    (acc, i) => {
      acc[i.tier] = (acc[i.tier] ?? 0) + 1;
      return acc;
    },
    {} as Record<ImpactTier, number>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Impact Analysis</h1>
        <div className="badge badge-primary">LocalCrab Impact Tiers</div>
      </div>

      {/* Tier Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className={`btn btn-sm ${selectedTier === "all" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setSelectedTier("all")}
        >
          All ({impacts.length})
        </button>
        {(["critical", "high", "medium", "low"] as ImpactTier[]).map((tier) => (
          <button
            key={tier}
            type="button"
            className={`btn btn-sm ${selectedTier === tier ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSelectedTier(tier)}
          >
            {TIER_ICONS[tier]} {tier} ({tierCounts[tier] ?? 0})
          </button>
        ))}
      </div>

      {/* Impact Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-12">
            <p className="dash-note">Loading impact analysis…</p>
          </div>
        ) : filteredImpacts.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="dash-note">No impacts matching filter.</p>
          </div>
        ) : (
          filteredImpacts.map((impact) => {
            const colors = TIER_COLORS[impact.tier];
            return (
              <div
                key={impact.targetId}
                className={`card shadow-xl ${colors.bg}`}
              >
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{TIER_ICONS[impact.tier]}</span>
                        <h3 className="card-title">
                          {impact.targetType === "forecast" ? "Forecast" : "Event"}
                          Impact
                        </h3>
                      </div>
                      <span className={`badge ${colors.badge} badge-lg`}>
                        {impact.tier.toUpperCase()}
                      </span>
                    </div>
                    <ConsensusDial
                      value={impact.score}
                      label={`${Math.round(impact.score * 100)}%`}
                    />
                  </div>

                  <div className="divider my-3" />

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-base-content/50">Target:</span>
                      <div className="font-mono text-xs truncate">{impact.targetId}</div>
                    </div>
                    <div>
                      <span className="text-base-content/50">Type:</span>
                      <div>{impact.targetType}</div>
                    </div>
                    <div>
                      <span className="text-base-content/50">Score:</span>
                      <div className={`font-semibold ${colors.text}`}>
                        {(impact.score * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <span className="text-base-content/50">By:</span>
                      <div className="truncate">{impact.generatedBy}</div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className="text-base-content/50 text-sm">Rationale:</span>
                    <p className="text-sm mt-1">{impact.rationale}</p>
                  </div>

                  <div className="mb-3">
                    <span className="text-base-content/50 text-sm">Affected Agents ({impact.affectedAgents.length}):</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {impact.affectedAgents.map((agent) => (
                        <span key={agent} className="badge badge-xs badge-outline">
                          {agent}
                        </span>
                      ))}
                    </div>
                  </div>

                  {impact.affectedDomains.length > 0 && (
                    <div className="mb-3">
                      <span className="text-base-content/50 text-sm">Domains:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {impact.affectedDomains.map((domain) => (
                          <span key={domain} className="badge badge-xs badge-secondary">
                            {domain}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {impact.mitigations.length > 0 && (
                    <details>
                      <summary className="text-sm text-primary cursor-pointer">
                        Mitigations ({impact.mitigations.length})
                      </summary>
                      <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                        {impact.mitigations.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
);
        }
        ))}
      </div>

      {/* Visualizations */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card bg-base-200 shadow-xl">
<div className="card-body">
              <h3 className="card-title">Impact Distribution by Tier</h3>
              <div className="h-64">
                <SwarmRadar />
              </div>
            </div>
        </div>

        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title">Score Distribution</h3>
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <p className="text-3xl font-bold">
                  {impacts.length > 0
                    ? `${(impacts.reduce((s, i) => s + i.score, 0) / impacts.length * 100).toFixed(0)}%`
                    : "—"}
                </p>
                <p className="text-base-content/50">Average Impact Score</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}