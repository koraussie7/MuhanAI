import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

const PROVIDERS = [
  "Gemini",
  "Claude",
  "GPT",
  "Mistral",
  "Groq",
  "Cerebras",
  "OpenRouter",
  "FreeLLMAPI",
  "LocalAI",
  "Ollama",
  "WebLLM",
];
const POLICIES = [
  "Best Quality",
  "Lowest Cost",
  "Fastest",
  "Free First",
  "Local First",
  "Privacy First",
  "Balanced",
];

export function LlmMeshPage() {
  const [policy, setPolicy] = useState("Free First");
  const chain =
    policy === "Free First"
      ? "WebLLM → FreeLLMAPI → P2P Compute → Paid API"
      : `${policy} 정책에 따라 라우팅됩니다.`;
  return (
    <Page title="LLM Mesh" subtitle={`라우팅 정책: ${policy}`}>
      <div className="provider-cloud">
        {PROVIDERS.map((p) => (
          <span className="provider-chip" key={p}>
            {p}
          </span>
        ))}
      </div>
      <div className="policy-row">
        {POLICIES.map((p) => (
          <button
            key={p}
            className={p === policy ? "policy-chip active" : "policy-chip"}
            onClick={() => setPolicy(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <p className="routing-chain">▶ {chain}</p>
    </Page>
  );
}

// ---- Token Bank (live from /api/rewards + table) ----
