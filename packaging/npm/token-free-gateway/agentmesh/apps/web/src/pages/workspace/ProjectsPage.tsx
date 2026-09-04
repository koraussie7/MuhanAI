import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #9: Projects
// =====================================================================
interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  agents: number;
  knowledge: number;
  tasks: number;
  files: number;
  workflows: number;
  conversations: number;
  contributions: number;
  updatedAt: string;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    load<Project[]>("/api/projects").then((d) => d && setProjects(d));
  }, []);

  return (
    <SpecPage
      title="Projects"
      subtitle="채팅방이 아니라 프로젝트 단위 워크스페이스"
    >
      <div className="spec-grid">
        {projects.map((p) => (
          <article className="spec-card" key={p.id}>
            <div className="spec-card-head">
              <span className={`spec-kind ${p.status}`}>{p.status}</span>
              <span className="spec-rating">{p.conversations}💬</span>
            </div>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <div className="spec-tags">
              <span className="spec-tag">🤖 에이전트 {p.agents}</span>
              <span className="spec-tag">📚 지식 {p.knowledge}</span>
              <span className="spec-tag">✓ 태스크 {p.tasks}</span>
              <span className="spec-tag">📁 파일 {p.files}</span>
              <span className="spec-tag">🔄 워크플로 {p.workflows}</span>
            </div>
            <div className="spec-card-meta">
              <span>기여 {p.contributions.toLocaleString("ko-KR")} credits</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-primary">열기</button>
              <button className="btn-secondary">설정</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}
