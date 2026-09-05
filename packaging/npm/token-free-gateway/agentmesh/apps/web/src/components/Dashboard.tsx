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

export const Dashboard: React.FC = () => {
  return (
    <main className="dashboard">
      <div className="dashboard-header">
        <div className="network-pulse-header">
          <NetworkPulse />
        </div>
        <div className="ask-network-header">
          <AskNetwork onSubmit={(question, targets) => {
            const params = new URLSearchParams();
            params.set("q", question);
            params.set("targets", targets.join(","));
            window.location.href = `/agent-cast?${params.toString()}`;
          }} />
        </div>
      </div>

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
              <button type="button" className="quick-action-btn">
                <span className="action-icon">❓</span>
                <span>Ask Network</span>
              </button>
              <button type="button" className="quick-action-btn">
                <span className="action-icon">📡</span>
                <span>Agent Cast</span>
              </button>
              <button type="button" className="quick-action-btn">
                <span className="action-icon">👤</span>
                <span>Find Human Expert</span>
              </button>
              <button type="button" className="quick-action-btn">
                <span className="action-icon">✅</span>
                <span>Verify Knowledge</span>
              </button>
              <button type="button" className="quick-action-btn">
                <span className="action-icon">🧠</span>
                <span>Teach AI</span>
              </button>
              <button type="button" className="quick-action-btn">
                <span className="action-icon">⚡</span>
                <span>Share Compute</span>
              </button>
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