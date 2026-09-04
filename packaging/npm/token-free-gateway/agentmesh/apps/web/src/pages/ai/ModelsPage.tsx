import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #6: Models catalog
// =====================================================================
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context: string;
  inputCost: number;
  outputCost: number;
  free: boolean;
  local: boolean;
}

export function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    load<ModelInfo[]>("/api/models").then((d) => d && setModels(d));
  }, []);

  return (
    <SpecPage
      title="Models"
      subtitle="1,247 models · 328 providers · 284 free — LLM Mesh 카탈로그"
    >
      <div className="spec-table">
        <div className="spec-table-head">
          <span>Model</span>
          <span>Provider</span>
          <span>Context</span>
          <span>Input</span>
          <span>Output</span>
          <span>Free</span>
          <span>Local</span>
        </div>
        {models.map((m) => (
          <div className="spec-table-row" key={m.id}>
            <strong>{m.name}</strong>
            <span>{m.provider}</span>
            <span>{m.context}</span>
            <span>${m.inputCost}/1M</span>
            <span>${m.outputCost}/1M</span>
            <span>{m.free ? "✅" : "—"}</span>
            <span>{m.local ? "🖥️" : "☁️"}</span>
          </div>
        ))}
      </div>
    </SpecPage>
  );
}
