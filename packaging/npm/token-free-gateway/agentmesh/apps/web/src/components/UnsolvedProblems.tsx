import React, { useState } from 'react';
import { UNSOLVED_PROBLEMS } from '../data/mockData';

interface UnsolvedProblem {
  id: string;
  title: string;
  description: string;
  category: string;
  aiAgents: number;
  humanExperts: number;
  sources: number;
  consensus: number;
  tags: string[];
}

interface UnsolvedProblemsProps {
  problems?: UnsolvedProblem[];
  maxItems?: number;
}

export const UnsolvedProblems: React.FC<UnsolvedProblemsProps> = ({
  problems = UNSOLVED_PROBLEMS,
  maxItems = 3
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories: string[] = ['all', ...new Set(problems.map((p: UnsolvedProblem) => p.category))];

  const filteredProblems = activeCategory === 'all'
    ? problems.slice(0, maxItems)
    : problems.filter((p: UnsolvedProblem) => p.category === activeCategory).slice(0, maxItems);

  const categoryLabels: Record<string, string> = {
    'all': '전체',
    'ai-failed': '🔥 AI가 해결하지 못함',
    'conflict': '🔥 정보가 서로 충돌함',
    'experience': '🔥 실제 경험 부족',
    'verification': '🔥 검증된 자료 부족',
    'outdated': '🔥 최신 정보 부족',
  };

  return (
    <section className="unsolved-problems-section">
      <div className="section-header">
        <h2 className="section-title">
          <span className="globe-icon">🌎</span>
          UNSOLVED PROBLEMS
        </h2>
        <div className="problems-count">
          <span className="count-number">{problems.length.toLocaleString()}</span>
          <span className="count-label">문제</span>
        </div>
      </div>

      <div className="category-tabs">
        {categories.map((cat: string) => (
          <button
            key={cat}
            className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {categoryLabels[cat] || cat}
          </button>
        ))}
      </div>

      <div className="problems-list">
        {filteredProblems.map((problem: UnsolvedProblem) => (
          <article key={problem.id} className="problem-card">
            <div className="problem-header">
              <span className="problem-id">Problem #{problem.id}</span>
              <span className="problem-category">{categoryLabels[problem.category] || problem.category}</span>
            </div>
            <h3 className="problem-title">{problem.title}</h3>
            <p className="problem-description">{problem.description}</p>
            <div className="problem-stats">
              <div className="stat-group">
                <span className="stat-label">AI Agents</span>
                <span className="stat-value">{problem.aiAgents}</span>
              </div>
              <div className="stat-group">
                <span className="stat-label">Human Experts</span>
                <span className="stat-value">{problem.humanExperts}</span>
              </div>
              <div className="stat-group">
                <span className="stat-label">Sources</span>
                <span className="stat-value">{problem.sources}</span>
              </div>
              <div className="stat-group consensus">
                <span className="stat-label">Consensus</span>
                <span className="stat-value">{problem.consensus}%</span>
              </div>
            </div>
            <button className="btn-primary participate-btn">참여하기</button>
          </article>
        ))}
      </div>
    </section>
  );
};