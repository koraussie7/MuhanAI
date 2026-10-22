/**
 * OntologyGraphPanel — sidebar for the /world 2-column layout.
 *
 * Lists ontology entities (with a type filter), shows the relations of the
 * selected entity (in + out), and reports the selection back to WorldPage so
 * WorldGlobe can fly the camera to the entity's coordinates.
 *
 * Data comes from lib/ontograph-integration over HTTP (thin client — no
 * @ontograph/core import in the browser), with a deterministic offline
 * fallback so the sidebar is never blank.
 */
import { Network, RefreshCw } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	explainRequestFor,
	fetchOntologySnapshot,
	relationsFor,
	pythiaExplainGraph,
	type ExplainGraphResult,
	type OntologyEntity,
	type OntologySnapshot,
	type OntologyTypeFilter,
} from "../lib/ontograph-integration";
export interface SelectedEntity {
  id: string;
  label: string;
  type: string;
  latitude?: number;
  longitude?: number;
}
const TYPE_COLORS: Record<OntologyEntity["type"], string> = {
  domain: "#38bdf8",
  concept: "#f59e0b",
  event: "#f43f5e",
  agent: "#10b981",
};
const TYPE_FILTERS: ReadonlyArray<{ key: OntologyTypeFilter; label: string }> =
  [
    { key: "all", label: "All" },
    { key: "domain", label: "Domains" },
    { key: "concept", label: "Concepts" },
    { key: "event", label: "Events" },
    { key: "agent", label: "Agents" },
  ];
export interface OntologyGraphPanelProps {
  /** Called when the user picks an entity — WorldPage forwards it to the globe. */
  onEntitySelect?: (entity: SelectedEntity | null) => void;
}
export const OntologyGraphPanel: React.FC<OntologyGraphPanelProps> = ({
  onEntitySelect,
}) => {
  const [snapshot, setSnapshot] = useState<OntologySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<OntologyTypeFilter>("all");
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<ExplainGraphResult | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await fetchOntologySnapshot());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const entities = useMemo(() => {
    const all = snapshot?.entities ?? [];
    return typeFilter === "all"
      ? all
      : all.filter((e) => e.type === typeFilter);
  }, [snapshot, typeFilter]);
  const selected = useMemo(
    () => entities.find((e) => e.id === selectedId) ?? null,
    [entities, selectedId],
  );
  const selectedRelations = useMemo(
    () => (snapshot && selected ? relationsFor(snapshot, selected.id) : null),
    [snapshot, selected],
  );
  const live = snapshot?.source === "ontograph";
  const handleSelect = (entity: OntologyEntity) => {
    const nextSelected = entity.id === selectedId ? null : entity;
    setSelectedId(nextSelected ? entity.id : null);
    onEntitySelect?.(
      nextSelected
        ? {
            id: entity.id,
            label: entity.label,
            type: entity.type,
            latitude: entity.latitude,
            longitude: entity.longitude,
          }
        : null,
    );
  };
  const entityLabel = (id: string): string =>
  	snapshot?.entities.find((e) => e.id === id)?.label ?? id;
  /**
   * Ask Pythia to explain the selected entity's neighborhood. Runs against
   * the Token-Free Gateway — zero cost, degrades to an error message when
   * no keyless provider is reachable.
   */
  const handleExplain = async () => {
  	if (!snapshot || !selected) return;
  	setExplaining(true);
  	setExplainError(null);
  	try {
  		setExplanation(await pythiaExplainGraph(explainRequestFor(snapshot, selected)));
  	} catch (err) {
  		setExplanation(null);
  		setExplainError(err instanceof Error ? err.message : "Unknown error");
  	} finally {
  		setExplaining(false);
  	}
  };
  return (
    <div
      data-testid="ontology-graph-panel"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
        borderRadius: 10,
        background: "var(--cline-bg-secondary, rgba(255,255,255,0.02))",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Network size={14} style={{ color: "#38bdf8" }} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--cline-text)",
            }}
          >
            Ontology Graph
          </span>
          <span
            data-testid="ontology-source-badge"
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 999,
              border: `1px solid ${live ? "#10b981" : "#f59e0b"}`,
              color: live ? "#10b981" : "#f59e0b",
            }}
          >
            {live ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            cursor: loading ? "default" : "pointer",
            border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
            background: "transparent",
            color: "var(--cline-text-muted)",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw
            size={10}
            className={loading ? "animate-spin" : undefined}
          />
          Refresh
        </button>
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          padding: "8px 12px",
        }}
      >
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setTypeFilter(f.key)}
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 999,
              border:
                typeFilter === f.key
                  ? "1px solid #38bdf8"
                  : "1px solid var(--cline-border, rgba(255,255,255,0.1))",
              background:
                typeFilter === f.key ? "rgba(56,189,248,0.15)" : "transparent",
              color:
                typeFilter === f.key ? "#38bdf8" : "var(--cline-text-muted)",
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
        {entities.length === 0 && (
          <p
            style={{
              fontSize: 12,
              color: "var(--cline-text-muted)",
              padding: "4px",
            }}
          >
            {loading ? "Loading ontology…" : "No entities match this filter."}
          </p>
        )}
        {entities.map((e) => {
          const isSelected = e.id === selectedId;
          return (
            <button
              key={e.id}
              type="button"
              data-testid={`ontology-entity-${e.id}`}
              onClick={() => handleSelect(e)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                fontSize: 12,
                padding: "7px 8px",
                marginBottom: 4,
                borderRadius: 7,
                cursor: "pointer",
                border: `1px solid ${isSelected ? "#38bdf8" : "transparent"}`,
                background: isSelected
                  ? "rgba(56,189,248,0.12)"
                  : "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
                color: "var(--cline-text)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  flexShrink: 0,
                  background: TYPE_COLORS[e.type],
                }}
              />
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {e.label}
              </span>
              <span style={{ fontSize: 9, color: "var(--cline-text-muted)" }}>
                {e.type}
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          data-testid="ontology-selected-relations"
          style={{
            borderTop: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
            padding: "8px 12px",
            maxHeight: "40%",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#38bdf8",
              marginBottom: 4,
            }}
          >
            {selected.label}
          </div>
          {selectedRelations &&
            selectedRelations.inbound.length === 0 &&
            selectedRelations.outbound.length === 0 && (
              <p
                style={{
                  fontSize: 10,
                  color: "var(--cline-text-muted)",
                  margin: 0,
                }}
              >
                No relations for this entity.
              </p>
            )}
          {selectedRelations?.outbound.map((r) => (
            <div
              key={r.id}
              style={{
                fontSize: 10,
                color: "var(--cline-text-muted)",
                marginBottom: 2,
              }}
            >
              → {entityLabel(r.target)}{" "}
              <span style={{ color: "#38bdf8" }}>({r.label})</span>
            </div>
          ))}
          {selectedRelations?.inbound.map((r) => (
            <div
              key={r.id}
              style={{
                fontSize: 10,
                color: "var(--cline-text-muted)",
                marginBottom: 2,
              }}
            >
              ← {entityLabel(r.source)}{" "}
              <span style={{ color: "#38bdf8" }}>({r.label})</span>
            </div>
          ))}
          <button
            type="button"
            data-testid="ontology-explain-button"
            onClick={handleExplain}
            disabled={explaining}
            style={{
              marginTop: 8,
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid rgba(56,189,248,0.4)",
              background: "rgba(56,189,248,0.1)",
              color: "#38bdf8",
              cursor: explaining ? "default" : "pointer",
              opacity: explaining ? 0.6 : 1,
              width: "100%",
            }}
          >
            {explaining ? "Pythia 분석중…" : "Pythia 그래프 설명"}
          </button>
          {explanation && (
            <div
              data-testid="ontology-explanation"
              style={{
                marginTop: 6,
                fontSize: 10,
                lineHeight: 1.5,
                color: "var(--cline-text)",
                whiteSpace: "pre-wrap",
                borderTop: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
                paddingTop: 6,
              }}
            >
              {explanation.explanation}
              <div style={{ fontSize: 9, color: "var(--cline-text-muted)", marginTop: 4 }}>
                {explanation.provider} · {explanation.cost}
              </div>
            </div>
          )}
          {explainError && (
            <div style={{ fontSize: 10, color: "var(--cline-rose, #f43f5e)", marginTop: 4 }}>
              {explainError}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default OntologyGraphPanel;
