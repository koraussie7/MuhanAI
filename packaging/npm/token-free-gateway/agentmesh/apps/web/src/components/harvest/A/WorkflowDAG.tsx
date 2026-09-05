import React, { useState } from "react";

// AgentFM-inspired: Autonomous Multi-Agent DAG Workflow Builder & Visualizer
export type WorkflowNode = {
  id: string;
  name: string;
  role: string;
  assignedTo: string;
  status: "idle" | "running" | "success" | "error";
  duration?: string;
};

export function WorkflowDAG() {
  const [nodes, setNodes] = useState<WorkflowNode[]>([
    { id: "step-1", name: "1. 쿼리 수신 & 복잡도 분석", role: "Router Node", assignedTo: "Local Gateway Router", status: "success", duration: "12ms" },
    { id: "step-2", name: "2. 다중 에이전트 지식 검색", role: "Search Submesh", assignedTo: "Gemini + WebSearch", status: "success", duration: "1.1s" },
    { id: "step-3", name: "3. Agent Cast 4인 교차 합의", role: "Consensus Engine", assignedTo: "Claude + DeepSeek + Local", status: "running", duration: "Ing..." },
    { id: "step-4", name: "4. 인간 전문가 검증 게이트", role: "PoH Validator", assignedTo: "Human Expert Pool", status: "idle" },
    { id: "step-5", name: "5. CRDT v2 지식 레이크 영구화", role: "Storage Mesh", assignedTo: "P2P Knowledge Pool", status: "idle" },
  ]);

  const [isRunning, setIsRunning] = useState(true);

  const triggerNext = () => {
    setNodes((prev) => {
      const runningIdx = prev.findIndex((n) => n.status === "running");
      if (runningIdx === -1) {
        // Reset to first
        return prev.map((n, i) => (i === 0 ? { ...n, status: "running" } : { ...n, status: "idle" }));
      }
      return prev.map((n, i) => {
        if (i === runningIdx) return { ...n, status: "success", duration: "1.4s" };
        if (i === runningIdx + 1) return { ...n, status: "running", duration: "Ing..." };
        return n;
      });
    });
  };

  return (
    <div className="workflow-dag-container">
      <div className="peer-canvas-toolbar" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="a2a-dot" style={{ background: isRunning ? "#e6ff87" : "#888" }} />
          <strong>자율 실행 파이프라인 (Autonomous Pipeline #892)</strong>
          <span className="protocol-badge proto-webrtc">Live DAG</span>
        </div>
        <button type="button" className="btn-primary" onClick={triggerNext}>
          다음 단계 강제 진행 ▶
        </button>
      </div>

      {/* DAG Flow Visualizer */}
      <div className="mesh-topology" style={{ padding: "24px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 640 }}>
          {nodes.map((node, idx) => (
            <React.Fragment key={node.id}>
              <div
                className="feature-card"
                style={{
                  margin: 0,
                  border: `1px solid ${
                    node.status === "running"
                      ? "#e6ff87"
                      : node.status === "success"
                      ? "#364a2b"
                      : "#24261f"
                  }`,
                  background: node.status === "running" ? "#1b2114" : "#141511",
                  boxShadow: node.status === "running" ? "0 0 15px rgba(230,255,135,0.15)" : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span
                      className={`webrtc-dot ${
                        node.status === "success"
                          ? "connected"
                          : node.status === "running"
                          ? "connecting"
                          : "offline"
                      }`}
                    />
                    <strong style={{ fontSize: 14, color: "#f4f5ed" }}>{node.name}</strong>
                    <span className="protocol-badge proto-memory">{node.role}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "#8f9188" }}>
                    할당: <strong style={{ color: "#c5c8ba" }}>{node.assignedTo}</strong>
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    className={`mesh-status ${
                      node.status === "success"
                        ? "online"
                        : node.status === "running"
                        ? "busy"
                        : "offline"
                    }`}
                  >
                    {node.status === "success" ? "✓ 완료" : node.status === "running" ? "● 처리 중" : "○ 대기"}
                  </span>
                  {node.duration && (
                    <div style={{ fontSize: 11, color: "#777a6e", marginTop: 4, fontFamily: "monospace" }}>
                      {node.duration}
                    </div>
                  )}
                </div>
              </div>

              {idx < nodes.length - 1 && (
                <div style={{ textAlign: "center", color: "#444", fontSize: 16, lineHeight: 1 }}>
                  ↓
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
