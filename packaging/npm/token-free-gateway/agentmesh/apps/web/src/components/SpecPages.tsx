import { FederatedSearch } from "./harvest/B/FederatedSearch";
import { KnowledgePool } from "./harvest/B/KnowledgePool";

export function KnowledgePage() {
  return <KnowledgePool />;
}

export function KnowledgeGraphPage() {
  return (
    <section className="panel">
      <div className="section-heading compact">
        <span className="section-label">KNOWLEDGE / GRAPH</span>
        <h2>Knowledge <em>Graph</em></h2>
      </div>
      <p className="dash-note">Graph visualization placeholder — harvest/B/ModelMesh 연동 예정</p>
    </section>
  );
}

export function SearchPage() {
  return <FederatedSearch />;
}
