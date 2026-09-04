import { useState, type FormEvent } from "react";

interface Agent {
  id: string;
  name: string;
  type: "AI" | "Human" | "Agent" | "MCP";
  confidence: number;
  isSelected: boolean;
}

interface CastResponse {
  answer?: {
    answer: string;
    confidence: number;
  };
  results?: {
    agentId: string;
    answer: string;
    confidence: number;
  }[];
}

export function AgentCast() {
  const [question, setQuestion] = useState("");
  const [agents, setAgents] = useState<Agent[]>([
    { id: "1", name: "Gemini", type: "AI", confidence: 0.92, isSelected: false },
    { id: "2", name: "Claude", type: "AI", confidence: 0.88, isSelected: false },
    { id: "3", name: "Human Expert", type: "Human", confidence: 0.95, isSelected: false },
    { id: "4", name: "Web Search", type: "Agent", confidence: 0.85, isSelected: false },
    { id: "5", name: "Knowledge Agent", type: "Agent", confidence: 0.90, isSelected: false },
    { id: "6", name: "P2P Agent", type: "Agent", confidence: 0.75, isSelected: false }
  ]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CastResponse | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
          question: setQuestion,
          agents: selectedAgents.map(a => a.id)
        })
      });

      const data = await res.json();
      setResponse(data);
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
            <span className="count">(선택한 에이전트: {agents.filter(a => a.isSelected).length})</span>
          </div>

          <div className="agent-list">
            {agents.map(agent => (
              <label key={agent.id} className="agent-option">
                <input
                  type="checkbox"
                  checked={agent.isSelected}
                  onChange={() => toggleAgent(agent.id)}
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
              {response.results.map(agent => (
                <div key={agent.agentId} className="agent-response">
                  <div className="agent-card">
                    <div className="agent-header">
                      <span className="agent-badge">{agent.agentId}</span>
                      <span>{(agent as unknown as { name?: string }).name ?? agent.agentId}</span>
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

function toggleAgent(id: string) {
  // This would be handled in the component's state
  console.log("Toggling agent", id);
}