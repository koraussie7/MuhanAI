import { useState } from "react";

interface McpTool {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: { name: string; type: string; required: boolean }[];
}

const MCP_TOOLS: McpTool[] = [
  {
    id: "search-web",
    name: "web_search",
    description: "Search the web for current information",
    category: "InfoMesh",
    parameters: [
      { name: "query", type: "string", required: true },
      { name: "max_results", type: "number", required: false },
    ],
  },
  {
    id: "fetch-url",
    name: "fetch_url",
    description: "Fetch and parse content from a URL",
    category: "InfoMesh",
    parameters: [
      { name: "url", type: "string", required: true },
      { name: "format", type: "string", required: false },
    ],
  },
  {
    id: "rag-query",
    name: "rag_query",
    description: "Query the RAG knowledge base",
    category: "Society",
    parameters: [
      { name: "query", type: "string", required: true },
      { name: "top_k", type: "number", required: false },
    ],
  },
  {
    id: "consensus",
    name: "consensus_vote",
    description: "Run consensus voting among agents",
    category: "miroclaw",
    parameters: [
      { name: "question", type: "string", required: true },
      { name: "agents", type: "array", required: true },
    ],
  },
];

const CATEGORIES = ["All", "InfoMesh", "Society", "miroclaw", "NeuroMesh"];

export function McpSkills() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const filtered = activeCategory === "All" ? MCP_TOOLS : MCP_TOOLS.filter((t) => t.category === activeCategory);

  const handleExecute = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    setResult(null);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setResult(`Executed ${selectedTool.name} with params: ${selectedTool.parameters.map((p) => p.name).join(", ")}`);
    setExecuting(false);
  };

  return (
    <section className="panel">
      <div className="section-heading compact">
        <span className="section-label">MCP / SKILLS</span>
        <h2>MCP <em>Skills</em></h2>
      </div>

      <div className="policy-row" style={{ marginBottom: 16 }}>
        {CATEGORIES.map((c) => (
          <button key={c} className={c === activeCategory ? "policy-chip active" : "policy-chip"} onClick={() => setActiveCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="spec-grid">
        {filtered.map((tool) => (
          <div key={tool.id} className={`spec-card ${selectedTool?.id === tool.id ? "active" : ""}`} onClick={() => setSelectedTool(tool)}>
            <span className="help-badge">{tool.category}</span>
            <h4 className="help-question">{tool.name}</h4>
            <p className="dash-note">{tool.description}</p>
            <div className="help-meta">
              <span>Params: {tool.parameters.map((p) => p.name).join(", ")}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedTool && (
        <div className="help-card" style={{ marginTop: 16 }}>
          <h4 className="help-question">Execute: {selectedTool.name}</h4>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {selectedTool.parameters.map((param) => (
              <input
                key={param.name}
                className="ask-input"
                placeholder={`${param.name}${param.required ? " *" : ""}`}
                style={{ maxWidth: 220 }}
              />
            ))}
            <button className="ask-btn" onClick={handleExecute} disabled={executing}>
              {executing ? "Running..." : "Run"}
            </button>
          </div>
          {result && (
            <div className="verify-queue-item" style={{ marginTop: 12 }}>
              <span className="claim-id">Result</span>
              <p>{result}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default McpSkills;
