import { useEffect, useState } from "react";

interface RightPanelProps {
  activeSection: string;
}

export function RightPanel({ activeSection }: RightPanelProps) {
  const [agents, setAgents] = useState<any[]>([]);
  const [compute, setCompute] = useState<any>({});
  const [llm, setLlm] = useState<any>({});
  const [mcp, setMcp] = useState<any>({});
  const [human, setHuman] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data
    setTimeout(() => {
      setAgents([
        { id: "1", name: "Gemini Research", type: "AI", online: true, capabilities: ["Research", "Web Search"], reputation: 98.4, success: 99.1 },
        { id: "2", name: "Claude Analyst", type: "AI", online: true, capabilities: ["Analysis", "Coding"], reputation: 97.2, success: 98.5 },
        { id: "3", name: "Web Search Agent", type: "Agent", online: true, capabilities: ["Search", "Crawl"], reputation: 95.8, success: 96.2 },
        { id: "4", name: "Human Expert: Vietnam Law", type: "Human", online: true, capabilities: ["Legal", "Business"], reputation: 99.1, success: 98.8 }
      ]);
      setCompute({ cpu: 8421, gpu: 1823, webgpu: 4921, totalTFLOPS: 128.4 });
      setLlm({ providers: 328, models: 1247, free: 284 });
      setMcp({ servers: 4821, tools: 12400, categories: 42 });
      setHuman({ online: 7542, available: 3821, specialties: 156 });
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return (
      <aside className="right-panel">
        <div className="panel-loading">
          <div className="spinner" />
          <p>패널을 불러오는 중...</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="right-panel" aria-label="Network panel">
      <div className="panel-section">
        <h3>Agents</h3>
        <div className="agent-list">
          {agents.map(agent => (
            <div key={agent.id} className="agent-card">
              <div className="agent-header">
                <span className={`agent-type ${agent.type}`}>{agent.type}</span>
                <span className={agent.online ? "online" : "offline"} />
              </div>
              <div className="agent-name">{agent.name}</div>
              <div className="agent-capabilities">
                {agent.capabilities.map((cap: string) => (
                  <span key={cap} className="cap-tag">{cap}</span>
                ))}
              </div>
              <div className="agent-stats">
                <span>Rep: {agent.reputation}%</span>
                <span>Success: {agent.success}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <h3>Compute</h3>
        <div className="compute-stats">
          <div className="compute-item">
            <span className="compute-value">{compute.cpu?.toLocaleString()}</span>
            <span className="compute-label">CPU Nodes</span>
          </div>
          <div className="compute-item">
            <span className="compute-value">{compute.gpu?.toLocaleString()}</span>
            <span className="compute-label">GPU Nodes</span>
          </div>
          <div className="compute-item">
            <span className="compute-value">{compute.webgpu?.toLocaleString()}</span>
            <span className="compute-label">WebGPU</span>
          </div>
          <div className="compute-item total">
            <span className="compute-value">{compute.totalTFLOPS} TFLOPS</span>
            <span className="compute-label">Total Compute</span>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h3>LLM</h3>
        <div className="llm-stats">
          <div className="llm-item">
            <span className="llm-value">{llm.providers}</span>
            <span className="llm-label">Providers</span>
          </div>
          <div className="llm-item">
            <span className="llm-value">{llm.models.toLocaleString()}</span>
            <span className="llm-label">Models</span>
          </div>
          <div className="llm-item">
            <span className="llm-value">{llm.free}</span>
            <span className="llm-label">Free</span>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h3>MCP</h3>
        <div className="mcp-stats">
          <div className="mcp-item">
            <span className="mcp-value">{mcp.servers?.toLocaleString()}</span>
            <span className="mcp-label">Servers</span>
          </div>
          <div className="mcp-item">
            <span className="mcp-value">{mcp.tools?.toLocaleString()}</span>
            <span className="mcp-label">Tools</span>
          </div>
          <div className="mcp-item">
            <span className="mcp-value">{mcp.categories}</span>
            <span className="mcp-label">Categories</span>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h3>Human</h3>
        <div className="human-stats">
          <div className="human-item">
            <span className="human-value">{human.online?.toLocaleString()}</span>
            <span className="human-label">Online</span>
          </div>
          <div className="human-item">
            <span className="human-value">{human.available?.toLocaleString()}</span>
            <span className="human-label">Available</span>
          </div>
          <div className="human-item">
            <span className="human-value">{human.specialties}</span>
            <span className="human-label">Specialties</span>
          </div>
        </div>
      </div>
    </aside>
  );
}