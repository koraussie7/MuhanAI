// apps/web/src/components/EvidenceExplorer.tsx
// P2PCLAW Evidence Explorer — evidence chain from Pythia events in LocalCrab
import { useEffect, useState } from "react";
import type { PythiaEvent, EventSeverity } from "@knowledge-base/visuals/pythia-types";
import { P2PConnectionGraph } from "./visuals/P2PConnectionGraph";

const API = import.meta.env.VITE_API_BASE ?? "";

const SEVERITY_ICONS: Record<EventSeverity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
  fatal: "💀",
};

export function EvidenceExplorer() {
  const [evidence, setEvidence] = useState<PythiaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadEvidence = async () => {
      try {
        const resp = await fetch(`${API}/api/p2pclaw/evidence?limit=100`);
        if (resp.ok) {
          const data: PythiaEvent[] = await resp.json();
          if (!cancelled) {
            setEvidence(data);
            setLoading(false);
          }
        }
      } catch {
        if (!cancelled) {
          // Demo data
          setEvidence([
            {
              eventId: "evt-001",
              sourceAgent: "claude-thin-client",
              kind: "evidence",
              severity: "info",
              title: "GLM-5.2 WASM module loaded",
              body: "Fellowship node fellowship-1 successfully loaded GLM-5.2 744B int4 quantization",
              timestamp: new Date().toISOString(),
              metadata: { cid: "bafyreibglm52", model: "GLM-5.2" },
              cid: "bafyreibglm52",
              schemaVersion: "1.0.0",
            },
            {
              eventId: "evt-002",
              sourceAgent: "claude-thin-client",
              kind: "evidence",
              severity: "warning",
              title: "P2P chunk replication lag",
              body: "Chunk 0 replication behind by 2 blocks; peer count dropped to 8",
              timestamp: new Date(Date.now() - 60000).toISOString(),
              metadata: { cid: "bafyreibglm52", chunk: 0 },
              cid: "bafyreibglm52-chunk0",
              schemaVersion: "1.0.0",
              parentEventId: "evt-001",
            },
            {
              eventId: "evt-003",
              sourceAgent: "agent-gemini",
              kind: "model_update",
              severity: "info",
              title: "Kimi K3 model cached on 3 fellowship nodes",
              body: "Kimi K3 1.6T int4 now available via P2P with 12 peers",
              timestamp: new Date(Date.now() - 120000).toISOString(),
              metadata: { cid: "bafyreibkimi-k3", model: "Kimi K3" },
              cid: "bafyreibkimi-k3",
              schemaVersion: "1.0.0",
            },
            {
              eventId: "evt-004",
              sourceAgent: "agent-local",
              kind: "verification",
              severity: "critical",
              title: "Memory pressure on browser nodes",
              body: "WASM heap approaching 200MB limit; consider offloading to fellowship",
              timestamp: new Date(Date.now() - 180000).toISOString(),
              metadata: { cid: "bafyreibglm52", memHeap: 192 },
              cid: "bafyreibglm52-mem",
              schemaVersion: "1.0.0",
              parentEventId: "evt-002",
            },
          ]);
          setLoading(false);
        }
      }
    };

    loadEvidence();
    const interval = setInterval(loadEvidence, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selectedEvidence = evidence.find((e) => e.eventId === selectedEvidenceId);
  const childEvidence = selectedEvidence
    ? evidence.filter((e) => e.parentEventId === selectedEvidence.eventId)
    : [];

  const severityCounts = evidence.reduce(
    (acc, e) => {
      acc[e.severity] = (acc[e.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<EventSeverity, number>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Evidence Explorer</h1>
        <div className="badge badge-primary">LocalCrab Evidence</div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Total Evidence</div>
            <div className="stat-value">{evidence.length}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Info</div>
            <div className="stat-value text-base-content/70">{severityCounts.info ?? 0}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Warnings</div>
            <div className="stat-value text-warning">{severityCounts.warning ?? 0}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Critical</div>
            <div className="stat-value text-error">{severityCounts.critical ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Layout: List + Detail */}
      <div className="grid grid-cols-3 gap-6">
        {/* Evidence List */}
        <div className="col-span-1 card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title">Evidence Chain ({evidence.length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {loading ? (
                <p className="dash-note">Loading evidence…</p>
              ) : evidence.length === 0 ? (
                <p className="dash-note">No evidence found.</p>
              ) : (
                evidence.map((e) => (
                  <button
                    key={e.eventId}
                    className={`w-full text-left p-3 rounded-lg border ${
                      selectedEvidenceId === e.eventId
                        ? "border-primary bg-primary/10"
                        : "border-base-300 hover:bg-base-100"
                    }`}
                    onClick={() => setSelectedEvidenceId(e.eventId)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{SEVERITY_ICONS[e.severity]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{e.title}</div>
                        <div className="text-xs text-base-content/50 truncate">{e.sourceAgent}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Detail View + Visualization */}
        <div className="col-span-2 space-y-4">
          {selectedEvidence ? (
            <>
              {/* Evidence Detail */}
              <div className="card bg-base-200 shadow-xl">
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{SEVERITY_ICONS[selectedEvidence.severity]}</span>
                        <h3 className="card-title">{selectedEvidence.title}</h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="badge badge-ghost">{selectedEvidence.kind}</span>
                        <span className="badge badge-ghost">{selectedEvidence.severity}</span>
                        <span className="text-xs text-base-content/50">
                          {new Date(selectedEvidence.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedEvidenceId(null)}
                    >
                      Close
                    </button>
                  </div>

                  <div className="divider my-4" />

                  <p className="text-base-content/80 mb-4">{selectedEvidence.body}</p>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-base-content/50">Event ID:</span>
                      <div className="font-mono">{selectedEvidence.eventId}</div>
                    </div>
                    <div>
                      <span className="text-base-content/50">Source Agent:</span>
                      <div>{selectedEvidence.sourceAgent}</div>
                    </div>
                    <div>
                      <span className="text-base-content/50">IPFS CID:</span>
                      <div className="font-mono truncate">
                        {selectedEvidence.cid ?? "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-base-content/50">Kind:</span>
                      <div>{selectedEvidence.kind}</div>
                    </div>
                  </div>

                  {selectedEvidence.metadata && Object.keys(selectedEvidence.metadata).length > 0 && (
                    <details className="mt-4">
                      <summary className="text-sm text-base-content/70 cursor-pointer">
                        Metadata
                      </summary>
                      <pre className="mt-2 p-3 bg-base-300 rounded text-xs overflow-auto">
                        {JSON.stringify(selectedEvidence.metadata, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Child Evidence */}
                  {childEvidence.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Derived Evidence ({childEvidence.length})</h4>
                      <div className="space-y-1">
                        {childEvidence.map((child) => (
                          <div
                            key={child.eventId}
                            className="p-2 bg-base-100 rounded border-l-2 border-primary"
                          >
                            <div className="text-sm">{child.title}</div>
                            <div className="text-xs text-base-content/50">
                              {child.sourceAgent} · {new Date(child.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEvidence.parentEventId && (
                    <div className="mt-4 p-2 bg-base-100 rounded border-l-2 border-warning">
                      <div className="text-sm">Parent Event: {selectedEvidence.parentEventId}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Network Context */}
              <div className="card bg-base-200 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">P2P Network Context</h3>
                  <P2PConnectionGraph peers={evidence.slice(0, 20) as any} />
                </div>
              </div>
            </>
          ) : (
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body text-center py-12">
                <p className="text-base-content/50">Select an evidence entry to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}