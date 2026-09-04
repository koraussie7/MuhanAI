import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #10: Search (InfoMesh-style)
// =====================================================================
interface SearchResult {
  id: string;
  title: string;
  kind: string;
  snippet: string;
  confidence: number;
  verified: boolean;
}

const KIND_EMOJI: Record<string, string> = {
  knowledge: "📚",
  agent: "🕸️",
  human: "👤",
  mcp: "🔌",
  source: "📄",
};

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    load<SearchResult[]>(
      query.trim() ? `/api/search?q=${encodeURIComponent(query)}` : "/api/search",
    ).then((d) => d && setResults(d));
  }, [query]);

  return (
    <SpecPage title="Search" subtitle="InfoMesh — 탈중앙화 MCP 네이티브 검색">
      <div className="global-search spec-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="지식·에이전트·인간 전문가·MCP·출처 검색…"
          className="search-input"
        />
        <button className="search-button">Search</button>
      </div>
      <div className="spec-list">
        {results.map((r) => (
          <article className="spec-row" key={r.id}>
            <span className="spec-row-icon">{KIND_EMOJI[r.kind] ?? "🔎"}</span>
            <div>
              <h3>{r.title}</h3>
              <p>{r.snippet}</p>
            </div>
            <div className="spec-row-meta">
              <span>{r.kind}</span>
              <span>신뢰도 {Math.round(r.confidence * 100)}%</span>
              {r.verified && <span className="spec-verified">✓ 검증됨</span>}
            </div>
          </article>
        ))}
        {results.length === 0 && (
          <p className="dash-note">검색 결과가 없습니다.</p>
        )}
      </div>
    </SpecPage>
  );
}
