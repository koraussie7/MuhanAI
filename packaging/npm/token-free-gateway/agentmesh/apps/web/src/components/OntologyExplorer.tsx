import { useMemo, useState } from "react";

const RELATIONS = ["supports", "derived_from", "impacts", "predicts"] as const;
const ENTITIES = [
  { id: "event", label: "Pythia Event", description: "Atomic research evidence emitted by an agent." },
  { id: "forecast", label: "Pythia Forecast", description: "A probabilistic claim linked to supporting events." },
  { id: "evidence", label: "LocalCrab Evidence", description: "Persisted evidence record with content-hash provenance." },
  { id: "impact", label: "Impact Analysis", description: "Impact tier and affected domain annotation." },
];
const FRAGMENTS = [
  { id: "event", label: "Pythia Event", region: "Asia Pacific", x: 276, y: 174, color: "#8df5d0" },
  { id: "forecast", label: "Pythia Forecast", region: "North America", x: 151, y: 142, color: "#8ab4ff" },
  { id: "evidence", label: "LocalCrab Evidence", region: "Europe", x: 238, y: 118, color: "#ffd27d" },
  { id: "impact", label: "Impact Analysis", region: "South America", x: 178, y: 231, color: "#ff8f9b" },
  { id: "memory", label: "Obsidian Memory", region: "Africa", x: 228, y: 207, color: "#d6a7ff" },
];

export function OntologyExplorer() {
  const [selectedId, setSelectedId] = useState("event");
  const selected = FRAGMENTS.find((fragment) => fragment.id === selectedId) ?? FRAGMENTS[0]!;
  const links = useMemo(() => FRAGMENTS.filter((fragment) => fragment.id !== selected.id), [selected.id]);

  return (
    <section className="page-box">
      <header className="page-box-header">
        <div className="page-box-title-row">
          <span className="page-box-icon">◎</span>
          <h2 className="page-box-title">Pythia World Intelligence</h2>
          <span className="page-box-badge">Ontology Live</span>
        </div>
        <p className="page-box-subtitle">
          Obsidian 지식 조각을 지구본 위에 배치하고 Pythia·LocalCrab 관계로 연결합니다.
        </p>
      </header>
      <div className="page-box-body" style={{ display: "flex", flexDirection: "column" }}>
        <div className="peer-grid" style={{ marginBottom: 20, order: 2 }}>
          {ENTITIES.map((entity) => (
            <article className="peer-card" key={entity.id}>
              <strong className="peer-name">{entity.label}</strong>
              <p className="dash-note">{entity.description}</p>
            </article>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.25fr) minmax(240px, .75fr)", gap: 20, alignItems: "stretch", order: 1 }}>
          <div style={{ minHeight: 390, borderRadius: 18, background: "radial-gradient(circle at 48% 42%, rgba(63, 117, 145, .32), rgba(8, 17, 29, .96) 62%)", border: "1px solid rgba(141, 245, 208, .18)", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", top: 16, left: 20, color: "#8df5d0", fontSize: 11, letterSpacing: ".14em" }}>OBSIDIAN / P2P KNOWLEDGE GLOBE</div>
            <svg viewBox="0 0 420 360" role="img" aria-label="D3HexMap-inspired Pythia knowledge globe" style={{ width: "100%", height: "100%", minHeight: 390 }}>
              <defs>
                <radialGradient id="hex-globe-fill" cx="42%" cy="34%"><stop offset="0" stopColor="#274b65" /><stop offset=".7" stopColor="#10273b" /><stop offset="1" stopColor="#081421" /></radialGradient>
                <filter id="hex-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                <clipPath id="hex-globe-clip"><circle cx="210" cy="180" r="138" /></clipPath>
              </defs>
              <circle cx="210" cy="180" r="138" fill="url(#hex-globe-fill)" stroke="#8df5d0" strokeOpacity=".5" strokeWidth="2" />
              <g clipPath="url(#hex-globe-clip)" opacity=".88">
                {Array.from({ length: 11 }, (_, row) => Array.from({ length: 15 }, (_, column) => {
                  const size = 17;
                  const x = 90 + column * 25 + (row % 2 ? 12.5 : 0);
                  const y = 58 + row * 29;
                  const points = `${x},${y - size * 0.58} ${x + size * 0.86},${y - size * 0.29} ${x + size * 0.86},${y + size * 0.29} ${x},${y + size * 0.58} ${x - size * 0.86},${y + size * 0.29} ${x - size * 0.86},${y - size * 0.29}`;
                  const distance = Math.hypot(x - 210, y - 180);
                  const color = ["#173d50", "#1f5c68", "#277c79", "#5aa66e", "#b5c66e"][Math.min(4, Math.floor(distance / 42))];
                  return <polygon key={`${row}-${column}`} points={points} fill={color} fillOpacity={distance < 138 ? .72 : .08} stroke="#8df5d0" strokeOpacity=".18" strokeWidth=".7" />;
                }))}
              </g>
              <ellipse cx="210" cy="180" rx="138" ry="54" fill="none" stroke="#8df5d0" strokeOpacity=".32" />
              <ellipse cx="210" cy="180" rx="52" ry="138" fill="none" stroke="#8df5d0" strokeOpacity=".2" />
              {links.map((fragment) => <line key={fragment.id} x1={selected.x} y1={selected.y} x2={fragment.x} y2={fragment.y} stroke={fragment.color} strokeOpacity=".7" strokeDasharray="4 5" />)}
              {FRAGMENTS.map((fragment) => <g key={fragment.id} onClick={() => setSelectedId(fragment.id)} style={{ cursor: "pointer" }} filter={fragment.id === selected.id ? "url(#hex-glow)" : undefined}><circle cx={fragment.x} cy={fragment.y} r={fragment.id === selected.id ? 9 : 6} fill={fragment.color} /><circle cx={fragment.x} cy={fragment.y} r={fragment.id === selected.id ? 16 : 11} fill="none" stroke={fragment.color} strokeOpacity=".4" /><text x={fragment.x + 12} y={fragment.y + 4} fill="#dcebf2" fontSize="10">{fragment.label}</text></g>)}
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="peer-card" style={{ borderColor: `${selected.color}66` }}><span className="protocol-badge proto-webrtc">SELECTED FRAGMENT</span><h3 className="peer-name" style={{ marginTop: 10 }}>{selected.label}</h3><p className="dash-note">{selected.region} · linked to {links.length} knowledge fragments</p></div>
            {FRAGMENTS.map((fragment) => <button type="button" key={fragment.id} onClick={() => setSelectedId(fragment.id)} className="peer-card" style={{ textAlign: "left", border: fragment.id === selected.id ? `1px solid ${fragment.color}` : undefined, cursor: "pointer" }}><strong className="peer-name">{fragment.label}</strong><span className="dash-note">{fragment.region}</span></button>)}
          </div>
        </div>
        <div className="chip-row" style={{ marginTop: 16 }}>{RELATIONS.map((relation) => <span className="cap-chip sm" key={relation}>{relation}</span>)}</div>
      </div>
    </section>
  );
}
