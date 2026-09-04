import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

const MESH_AGENTS = [
  {
    name: "Gemini Research Agent",
    status: "Online",
    capabilities: "Research, Web Search, Summarization",
    latency: "1.2s",
    reputation: 98.4,
    success: 99.1,
  },
  {
    name: "Claude Analysis Agent",
    status: "Online",
    capabilities: "Analysis, Coding, Review",
    latency: "0.9s",
    reputation: 97.8,
    success: 98.6,
  },
  {
    name: "Local LLM Agent",
    status: "Online",
    capabilities: "Local Inference, Privacy",
    latency: "2.1s",
    reputation: 95.2,
    success: 96.4,
  },
  {
    name: "Human Expert Pool",
    status: "Online",
    capabilities: "Experience, Verification",
    latency: "-",
    reputation: 99.1,
    success: 97.9,
  },
];
export function AgentMeshPage() {
  return (
    <Page
      title="Agent Mesh"
      subtitle="User → Router → Mesh (Gemini · Claude · Local · Web · MCP · Human · P2P GPU)"
    >
      <div className="agent-card-grid">
        {MESH_AGENTS.map((a) => (
          <article className="mesh-card" key={a.name}>
            <div className="mesh-card-head">
              <strong>{a.name}</strong>
              <span className="mesh-status">● {a.status}</span>
            </div>
            <p className="mesh-caps">{a.capabilities}</p>
            <div className="mesh-meta">
              <span>지연: {a.latency}</span>
              <span>평판: {a.reputation}</span>
              <span>성공률: {a.success}%</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-secondary">Connect</button>
              <button className="btn-primary">Use</button>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}

