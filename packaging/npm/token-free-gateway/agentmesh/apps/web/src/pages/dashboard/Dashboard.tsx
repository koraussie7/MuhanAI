import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NetworkPulse, usePulse } from './NetworkPulse';
import { HelpNeeded } from './HelpNeeded';
import { TrendingQuestions } from './TrendingQuestions';
import { VerifyMe } from './VerifyMe';
import { HumanKnowledgeWanted } from './HumanKnowledgeWanted';
import { UnsolvedProblems } from './UnsolvedProblems';
import { AiVsHuman } from './AiVsHuman';
import { TeachAI } from './TeachAI';
import { AskNetwork } from './AskNetwork';

// §2: action-oriented needs strip. Each row states a network need, shows the
// live count from /api/pulse and routes to the feed that resolves it.
const NEEDS: { icon: string; text: string; to: string; pulseKey: 'newQuestions' | 'verifyRequests' | 'humansNeeded' | 'aiConflicts' | 'knowledgeGaps' }[] = [
  { icon: '🔥', text: 'AI가 해결하지 못한 질문', to: '/help-needed', pulseKey: 'newQuestions' },
  { icon: '👤', text: '인간의 경험이 필요한 질문', to: '/human-knowledge', pulseKey: 'humansNeeded' },
  { icon: '🔎', text: '검증이 필요한 정보', to: '/verify', pulseKey: 'verifyRequests' },
  { icon: '⚔️', text: 'AI들의 의견이 충돌한 문제', to: '/unsolved', pulseKey: 'aiConflicts' },
  { icon: '🧠', text: 'AI가 배우고 싶은 인간 지식', to: '/teach-ai', pulseKey: 'knowledgeGaps' },
];

function NetworkNeedsYou() {
  const pulse = usePulse();
  const navigate = useNavigate();
  return (
    <section className="network-needs-you" aria-label="Network Needs You">
      <h2 className="needs-you-title">NETWORK NEEDS YOU</h2>
      <div className="needs-you-grid">
        {NEEDS.map(({ icon, text, to, pulseKey }) => (
          <button
            key={to + text}
            type="button"
            className="need-card"
            onClick={() => navigate(to)}
          >
            <span className="need-icon">{icon}</span>
            <span className="need-text">{text}</span>
            <strong className="need-count">{(pulse?.[pulseKey] ?? 0).toLocaleString('ko-KR')}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const quickActions: { icon: string; label: string; to: string }[] = [
    { icon: '❓', label: 'Ask Network', to: '/agent-cast' },
    { icon: '📡', label: 'Agent Cast', to: '/agent-cast' },
    { icon: '👤', label: 'Find Human Expert', to: '/human-agents' },
    { icon: '✅', label: 'Verify Knowledge', to: '/verify' },
    { icon: '🧠', label: 'Teach AI', to: '/teach-ai' },
    { icon: '⚡', label: 'Share Compute', to: '/compute-mesh' },
  ];

  return (
    <main className="dashboard">
      <div className="dashboard-header">
        <div className="network-pulse-header">
          <NetworkPulse />
        </div>
        <div className="ask-network-header">
          <AskNetwork />
        </div>
      </div>

      <NetworkNeedsYou />

      <div className="dashboard-content">
        <section className="dashboard-main">
          <HelpNeeded />
          <TrendingQuestions maxItems={5} />
          <VerifyMe />
          <HumanKnowledgeWanted maxItems={3} />
          <UnsolvedProblems maxItems={3} />
          <AiVsHuman maxItems={2} />
          <TeachAI />
        </section>

        <aside className="dashboard-sidebar">
          <div className="sidebar-widget">
            <h3>💡 QUICK ACTIONS</h3>
            <div className="quick-actions">
              {quickActions.map(({ icon, label, to }) => (
                <button
                  key={label}
                  type="button"
                  className="quick-action-btn"
                  onClick={() => navigate(to)}
                >
                  <span className="action-icon">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-widget">
            <h3>📊 YOUR STATS</h3>
            <div className="user-stats">
              <div className="user-stat">
                <span className="stat-value">1,842</span>
                <span className="stat-label">Answers</span>
              </div>
              <div className="user-stat">
                <span className="stat-value">492</span>
                <span className="stat-label">Verified</span>
              </div>
              <div className="user-stat">
                <span className="stat-value">128</span>
                <span className="stat-label">Knowledge</span>
              </div>
              <div className="user-stat">
                <span className="stat-value">98,421</span>
                <span className="stat-label">Total Credits</span>
              </div>
            </div>
          </div>

          <div className="sidebar-widget">
            <h3>🔥 TRENDING TOPICS</h3>
            <div className="trending-topics">
              {['AI Agent Mesh', 'P2P AI', 'Vietnam Business', 'LUNC Ecosystem', 'Distributed Inference'].map((topic, i) => (
                <div key={topic} className="trending-topic">
                  <span className="topic-rank">#{i + 1}</span>
                  <span className="topic-name">{topic}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
};