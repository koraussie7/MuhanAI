import type React from 'react';
import { NetworkPulse } from './NetworkPulse';
import { HelpNeeded } from './HelpNeeded';
import { TrendingQuestions } from './TrendingQuestions';
import { VerifyMe } from './VerifyMe';
import { HumanKnowledgeWanted } from './HumanKnowledgeWanted';
import { UnsolvedProblems } from './UnsolvedProblems';
import { AiVsHuman } from './AiVsHuman';
import { TeachAI } from './TeachAI';
import { AskNetwork } from './AskNetwork';
import { Sparkles, Radio, Users, CheckCircle2, Cpu, Zap } from 'lucide-react';

interface DashboardProps {
  onNavigate?: (path: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const navigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <main className="dashboard">
      {/* Cline-Style Developer Banner */}
      <div className="dashboard-hero-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="brand-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--cline-green)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                ● P2P MESH OPERATIONAL
              </span>
              <span className="brand-badge">TOKEN-FREE GATEWAY</span>
            </div>
            <h1 className="dashboard-hero-title">
              MuhanAI Autonomous Agent Mesh
            </h1>
            <p className="dashboard-hero-desc">
              Cline 스타일의 탈중앙화 AI 에이전트 네트워크입니다. 로컬 및 분산 모델이 합의를 통해 검증된 지식을 생성하고 협력합니다.
            </p>
          </div>

          <button
            type="button"
            className="top-action-btn"
            onClick={() => navigate('/agent-cast')}
          >
            <Radio size={14} />
            Launch Agent Cast
          </button>
        </div>

        {/* Quick Actions Grid */}
        <div className="quick-action-strip">
          <div className="quick-action-tile" onClick={() => navigate('/agent-cast')}>
            <Radio size={16} color="var(--cline-sky)" />
            <span>Agent Cast</span>
          </div>
          <div className="quick-action-tile" onClick={() => navigate('/marketplace/human-experts')}>
            <Users size={16} color="var(--cline-indigo)" />
            <span>Human Experts</span>
          </div>
          <div className="quick-action-tile" onClick={() => navigate('/verification')}>
            <CheckCircle2 size={16} color="var(--cline-green)" />
            <span>Verification</span>
          </div>
          <div className="quick-action-tile" onClick={() => navigate('/models')}>
            <Sparkles size={16} color="var(--cline-amber)" />
            <span>LLM Models</span>
          </div>
          <div className="quick-action-tile" onClick={() => navigate('/compute-mesh')}>
            <Cpu size={16} color="var(--cline-rose)" />
            <span>Compute Mesh</span>
          </div>
        </div>
      </div>

      {/* Network Pulse Ribbon */}
      <div className="network-pulse-header" style={{ marginBottom: 20 }}>
        <NetworkPulse />
      </div>

      {/* Ask Network Quick Prompt */}
      <div className="ask-network-header" style={{ marginBottom: 24 }}>
        <AskNetwork
          onSubmit={(question, targets) => {
            const params = new URLSearchParams();
            params.set('q', question);
            params.set('targets', targets.join(','));
            navigate(`/agent-cast?${params.toString()}`);
          }}
        />
      </div>

      {/* Main Grid Content */}
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
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color="var(--cline-amber)" />
              YOUR MESH CREDITS
            </h3>
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
                <span className="stat-value" style={{ color: 'var(--cline-sky)' }}>98,421</span>
                <span className="stat-label">MHT Credits</span>
              </div>
            </div>
          </div>

          <div className="sidebar-widget">
            <h3>🔥 TRENDING TOPICS</h3>
            <div className="trending-topics">
              {['Cline Agent Swarm', 'P2P Consensus', 'Vietnam Tech Hub', 'Zero-Token Gateway', 'WebGPU Edge Inference'].map((topic, i) => (
                <div key={topic} className="trending-topic" onClick={() => navigate(`/search?q=${encodeURIComponent(topic)}`)} style={{ cursor: 'pointer' }}>
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
