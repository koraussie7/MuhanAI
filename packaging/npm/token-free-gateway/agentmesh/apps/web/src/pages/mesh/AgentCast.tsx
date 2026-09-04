import { useState, useEffect, type FormEvent } from "react";
import { load, apiPost } from "../../services/api";

interface AgentDescriptor {
  id: string;
  name: string;
  type: "llm" | "human" | "mcp" | "compute" | "search";
  confidence?: number;
}

interface CastResultItem {
  agentId: string;
  answer: string;
  confidence: number;
}

interface CastResponse {
  results: CastResultItem[];
  answer: CastResultItem;
}

export function AgentCast() {
  const [question, setQuestion] = useState("");
  const [agents, setAgents] = useState<AgentDescriptor[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CastResponse | null>(null);

  useEffect(() => {
    load<AgentDescriptor[]>("/api/agents").then((agentList) => {
      if (agentList) {
        setAgents(agentList);
        setSelectedAgents(new Set(agentList.map((a) => a.id)));
      }
    });
  }, []);

  const toggleAgent = (id: string) => {
    const next = new Set(selectedAgents);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedAgents(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedAgents.size === 0) return;
    setLoading(true);
    try {
      const res = await apiPost<CastResponse>("/api/cast", {
        question,
        agents: Array.from(selectedAgents),
      });
      if (res) setResponse(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel agent-cast">
      <div className="section-heading compact">
        <span className="section-label">07 / AGENT CAST</span>
        <h2>AI가 답변하지 못하는 문제를<br /><em>여러 에이전트에게 동시에 문의</em></h2>
      </div>

      <form onSubmit={handleSubmit} className="cast-form">
        <div className="cast-input">
          <label htmlFor="question-input">질문</label>
          <textarea
            id="question-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예: 베트남에서 한국인이 사업자 등록을 할 때 가장 많이 발생하는 문제는 무엇인가?"
            rows={3}
            disabled={loading}
          />
        </div>

        <div className="agent-selection">
          <div className="selection-header">
            <span>에이전트 선택</span>
            <span className="count">(선택한 에이전트: {selectedAgents.size})</span>
          </div>

          <div className="agent-list">
            {agents.map((agent) => (
              <label key={agent.id} className="agent-option">
                <input
                  type="checkbox"
                  checked={selectedAgents.has(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                />
                <span className={`agent-badge ${agent.type}`}>
                  {agent.name} ({Math.round((agent.confidence ?? 0) * 100)}%)
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="cast-actions">
          <button type="submit" className="primary-button" disabled={loading || !question.trim() || selectedAgents.size === 0}>
            {loading ? "상담 중..." : "에이전트에게 문의"}
          </button>
        </div>
      </form>

      {response && (
        <div className="cast-results">
          <div className="cast-header">
            <span>CONSENSUS · {Math.round((response.answer?.confidence ?? 0) * 100)}%</span>
            <span className="cast-time">현재 {new Date().toLocaleTimeString()}</span>
          </div>

          {response.answer && (
            <article className="cast-answer">
              <p className="cast-answer-text">{response.answer.answer}</p>
            </article>
          )}

          {response.results && (
            <div className="cast-agent-results">
              <h3>개별 에이전트 답변</h3>
              {response.results.map((agent) => (
                <div key={agent.agentId} className="agent-response">
                  <div className="agent-card">
                    <div className="agent-header">
                      <span className="agent-badge">{agent.agentId}</span>
                      <span>{agent.agentId}</span>
                      <span className={`agent-confidence ${agent.confidence > 0.9 ? "high" : agent.confidence > 0.7 ? "medium" : "low"}`}>
                        {Math.round(agent.confidence * 100)}%
                      </span>
                    </div>
                    <p className="agent-answer">{agent.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}