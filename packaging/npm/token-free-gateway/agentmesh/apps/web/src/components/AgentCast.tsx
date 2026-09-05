import { useState, type FormEvent } from "react";

interface Agent {
  id: string;
  name: string;
  type: "AI" | "Human" | "Agent" | "MCP";
  confidence: number;
  isSelected: boolean;
}

interface CastResponse {
  request: {
    id: string;
    question: string;
    agents: string[];
  };
  results: {
    agentId: string;
    answer: string;
    confidence: number;
    latencyMs: number;
    error?: string;
  }[];
  answer: {
    agentId: string;
    answer: string;
    confidence: number;
    latencyMs: number;
  } | undefined;
  networkResponse: {
    answer: string;
    confidence: number;
    route: string;
    agentsUsed: string[];
    needsHuman: boolean;
    humanPrompt?: string;
    metadata?: Record<string, unknown>;
  };
}

export function AgentCast() {
  const [question, setQuestion] = useState("");
  const [agents, setAgents] = useState<Agent[]>([
    { id: "mock", name: "Mock Agent", type: "Agent", confidence: 0.60, isSelected: false },
    { id: "gateway", name: "Gateway LLM", type: "AI", confidence: 0.88, isSelected: false }
  ]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const selectedAgents = agents.filter(a => a.isSelected);
      if (selectedAgents.length === 0) {
        alert("적어도 1개의 에이전트를 선택해주세요");
        return;
      }

      const res = await fetch("/api/cast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          agents: selectedAgents.map(a => a.id),
          preferredRoute: "auto",
          confidenceThreshold: 0.72,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Agent Cast request failed");
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent Cast request failed");
    } finally {
      setLoading(false);
    }
  };

  const routeLabel: Record<string, string> = {
    ai: "AI 직접 응답",
    human: "인간 전문가 에스컬레이션",
    knowledge: "Knowledge Base 라우팅",
    web: "Web Search 라우팅",
    mixed: "Multi-Agent 협업",
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
            <span className="count">(선택한 에이전트: {agents.filter(a => a.isSelected).length})</span>
          </div>

          <div className="agent-list">
            {agents.map(agent => (
              <label key={agent.id} className="agent-option">
                <input
                  type="checkbox"
                  checked={agent.isSelected}
                  onChange={() => setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, isSelected: !item.isSelected } : item))}
                />
                <span className={`agent-badge ${agent.type}`}>
                  {agent.name} ({Math.round(agent.confidence * 100)}%)
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="cast-actions">
          <button type="submit" className="primary-button" disabled={loading || !question.trim()}>
            {loading ? "상담 중..." : "에이전트에게 문의"}
          </button>
        </div>
      </form>

      {error && <p className="form-error">{error}</p>}

      {response && (
        <div className="cast-results">
          <div className="cast-header">
            <span>
              {routeLabel[response.networkResponse.route] ?? response.networkResponse.route} ·
              Confidence {Math.round(response.networkResponse.confidence * 100)}%
            </span>
            <span className="cast-time">현재 {new Date().toLocaleTimeString()}</span>
          </div>

          {response.networkResponse.needsHuman && response.networkResponse.humanPrompt && (
            <div className="human-escalation">
              <strong>인간 전문가 에스컬레이션</strong>
              <p>{response.networkResponse.humanPrompt}</p>
            </div>
          )}

          {response.answer && (
            <article className="cast-answer">
              <p className="cast-answer-text">{response.answer.answer}</p>
            </article>
          )}

          {response.results && response.results.length > 0 && (
            <div className="cast-agent-results">
              <h3>개별 에이전트 답변</h3>
              {response.results.map(agent => (
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
