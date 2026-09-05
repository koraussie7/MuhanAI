import { useState } from "react";

interface ModelItem {
  name: string;
  provider: string;
  status: "Online" | "Busy" | "Offline";
  backend: string;
  size: string;
  ctx: number;
}

const DEMO_MODELS: ModelItem[] = [
  { name: "Gemini 2.5 Pro", provider: "Google", status: "Online", backend: "Remote", size: "—", ctx: 0 },
  { name: "Claude Sonnet 4", provider: "Anthropic", status: "Online", backend: "Remote", size: "—", ctx: 0 },
  { name: "Llama 4 Maverick", provider: "Meta", status: "Online", backend: "Ollama", size: "~14GB", ctx: 8192 },
  { name: "DeepSeek R1", provider: "DeepSeek", status: "Busy", backend: "Ollama", size: "~14GB", ctx: 8192 },
];

export function ModelHub() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"installed" | "browse">("installed");

  const filtered = DEMO_MODELS.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="panel">
      <div className="section-heading compact">
        <span className="section-label">MODELS / HUB</span>
        <h2>Model <em>Hub</em></h2>
      </div>

      <div className="policy-row" style={{ marginBottom: 12 }}>
        <button className={tab === "installed" ? "policy-chip active" : "policy-chip"} onClick={() => setTab("installed")}>
          Installed / Local
        </button>
        <button className={tab === "browse" ? "policy-chip active" : "policy-chip"} onClick={() => setTab("browse")}>
          Browse HuggingFace
        </button>
      </div>

      <div className="ask-input-group" style={{ marginBottom: 12 }}>
        <input className="ask-input" placeholder="Search models, e.g. llama 7b, mistral, phi..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="ask-btn">Search</button>
      </div>

      <div className="spec-grid">
        {filtered.map((m) => (
          <div key={m.name} className="spec-card">
            <div className="mesh-card-head">
              <strong>{m.name}</strong>
              <span className={`mesh-status ${m.status === "Online" ? "online" : m.status === "Busy" ? "offline" : "offline"}`}>● {m.status}</span>
            </div>
            <p className="mesh-caps">{m.provider}</p>
            <div className="mesh-meta">
              <span>Backend: {m.backend}</span>
              <span>Size: {m.size}</span>
              <span>Ctx: {m.ctx || "—"}</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-secondary small">Load</button>
              <button className="btn-primary small">Use</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ModelHub;
