import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #9: Workflows
// =====================================================================
interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: { name: string; icon: string }[];
  status: "active" | "draft";
  runs: number;
  avgDuration: string;
  lastRun: string;
}

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  useEffect(() => {
    load<Workflow[]>("/api/workflows").then((d) => d && setWorkflows(d));
  }, []);

  return (
    <SpecPage
      title="Workflows"
      subtitle="시각적 파이프라인 — Research → Web Search → LLM Cast → Human Verification → Knowledge Engine → Report"
    >
      <div className="spec-list">
        {workflows.map((w) => (
          <article className="spec-card workflow" key={w.id}>
            <div className="spec-card-head">
              <span className={`spec-kind ${w.status}`}>{w.status}</span>
              <span className="spec-rating">▶ {w.runs} runs</span>
            </div>
            <h3>{w.name}</h3>
            <p>{w.description}</p>
            <div className="wf-pipeline">
              {w.steps.map((s, i) => (
                <React.Fragment key={s.name}>
                  {i > 0 && <span className="wf-arrow">→</span>}
                  <span className="wf-step">
                    <span className="wf-icon">{s.icon}</span>
                    {s.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="spec-card-meta">
              <span>평균 {w.avgDuration}</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-primary">실행</button>
              <button className="btn-secondary">편집</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}
