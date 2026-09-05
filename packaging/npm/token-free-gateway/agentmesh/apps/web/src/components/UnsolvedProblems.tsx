import React, { useState } from 'react';
import { UNSOLVED_PROBLEMS, type UnsolvedProblem } from '../data/mockData';
import { Globe, Flame, AlertTriangle, HelpCircle, FileCheck, ArrowRight, Bot, Users, BookOpen, CheckCircle2 } from 'lucide-react';

interface UnsolvedProblemsProps {
  problems?: UnsolvedProblem[];
  maxItems?: number;
}

export const UnsolvedProblems: React.FC<UnsolvedProblemsProps> = ({
  problems = UNSOLVED_PROBLEMS,
  maxItems = 4
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [participated, setParticipated] = useState<Set<string>>(new Set());

  const categories = [
    { id: 'all', label: '전체' },
    { id: 'conflict', label: '🔥 정보가 서로 충돌함' },
    { id: 'outdated', label: '🔥 최신 정보 부족' },
    { id: 'experience', label: '🔥 실제 경험 부족' },
    { id: 'verification', label: '🔥 검증된 자료 부족' },
  ];

  const filteredProblems = problems
    .filter(p => activeCategory === 'all' || p.category === activeCategory)
    .slice(0, maxItems);

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'conflict':
        return { label: '정보가 서로 충돌함', color: 'var(--cline-rose)', bg: 'rgba(244, 63, 94, 0.12)' };
      case 'outdated':
        return { label: '최신 정보 부족', color: 'var(--cline-amber)', bg: 'rgba(245, 158, 11, 0.12)' };
      case 'experience':
        return { label: '실제 경험 부족', color: 'var(--cline-sky)', bg: 'rgba(14, 165, 233, 0.12)' };
      case 'verification':
        return { label: '검증된 자료 부족', color: 'var(--cline-indigo)', bg: 'rgba(99, 102, 241, 0.12)' };
      default:
        return { label: '미해결 과제', color: 'var(--cline-text-muted)', bg: 'rgba(255, 255, 255, 0.08)' };
    }
  };

  const handleParticipate = (id: string, title: string) => {
    setParticipated(prev => new Set(prev).add(id));
    window.location.href = `/agent-cast?q=${encodeURIComponent(title)}`;
  };

  return (
    <section className="unsolved-problems-section">
      {/* Header */}
      <div className="section-head-boxed">
        <div className="head-badge-row">
          <span className="head-badge-tag">03 / ACTIVE CHALLENGES</span>
          <span className="head-status-count">
            <Globe size={13} style={{ display: 'inline', marginRight: 4 }} />
            {filteredProblems.length}개 과제 진행 중
          </span>
        </div>
        <h2 className="section-boxed-title">
          UNSOLVED PROBLEMS
        </h2>
        <p className="section-boxed-desc">
          단일 모델로는 풀 수 없거나 인간 전문가의 피드백이 반드시 필요한 P2P 네트워크 미해결 과제입니다.
        </p>
      </div>

      {/* Category Filter Pills */}
      <div className="unsolved-category-pills">
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`unsolved-pill-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Problems Grid of Boxed Cards */}
      <div className="unsolved-grid-boxed">
        {filteredProblems.map((problem) => {
          const catMeta = getCategoryBadge(problem.category);
          const isDone = participated.has(problem.id);

          return (
            <article key={problem.id} className="problem-card-boxed">
              {/* Top Row: Problem ID + Category */}
              <div className="problem-top-row">
                <span className="problem-id-tag">Problem #{problem.id}</span>
                <span
                  className="problem-cat-pill"
                  style={{ color: catMeta.color, background: catMeta.bg, borderColor: catMeta.color }}
                >
                  <Flame size={12} />
                  {catMeta.label}
                </span>
              </div>

              {/* Title & Description */}
              <h3 className="problem-card-title">{problem.title}</h3>
              <p className="problem-card-desc">{problem.description}</p>

              {/* 4-Box Telemetry Metrics */}
              <div className="problem-stats-grid">
                <div className="stat-box">
                  <span className="stat-box-lbl">
                    <Bot size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                    AI Agents
                  </span>
                  <span className="stat-box-val">{problem.aiAgents}</span>
                </div>

                <div className="stat-box">
                  <span className="stat-box-lbl">
                    <Users size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                    Human Experts
                  </span>
                  <span className="stat-box-val">{problem.humanExperts}</span>
                </div>

                <div className="stat-box">
                  <span className="stat-box-lbl">
                    <BookOpen size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                    Sources
                  </span>
                  <span className="stat-box-val">{problem.sources}</span>
                </div>

                <div className="stat-box highlight">
                  <span className="stat-box-lbl">Consensus</span>
                  <span className="stat-box-val" style={{ color: problem.consensus >= 60 ? 'var(--cline-green)' : 'var(--cline-amber)' }}>
                    {problem.consensus}%
                  </span>
                </div>
              </div>

              {/* Footer: Tags & Action Button */}
              <div className="problem-card-footer">
                <div className="problem-tags-row">
                  {problem.tags.map(tag => (
                    <span key={tag} className="problem-tag-chip">#{tag}</span>
                  ))}
                </div>

                <button
                  type="button"
                  className={`participate-action-btn ${isDone ? 'done' : ''}`}
                  onClick={() => handleParticipate(problem.id, problem.title)}
                >
                  {isDone ? (
                    <>
                      <CheckCircle2 size={13} />
                      참여 중
                    </>
                  ) : (
                    <>
                      참여하기
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
