import React from 'react';

interface RewardEvent {
  id: string;
  type: 'answer' | 'verify' | 'teach' | 'compute' | 'p2p-compute' | 'mcp' | 'knowledge';
  amount: number;
  description: string;
  timestamp: string;
}

interface RewardsDisplayProps {
  totalCredits?: number;
  todayEarned?: number;
  recentEvents?: RewardEvent[];
}

const ICONS: Record<string, string> = {
  answer: '💬',
  verify: '✅',
  teach: '🧠',
  compute: '⚡',
  'p2p-compute': '🌐',
  mcp: '🔌',
  knowledge: '📚',
};

const LABELS: Record<string, string> = {
  answer: 'Answer',
  verify: 'Verify',
  teach: 'Teach',
  compute: 'Compute',
  'p2p-compute': 'P2P Compute',
  mcp: 'MCP',
  knowledge: 'Knowledge',
};

export const RewardsDisplay: React.FC<RewardsDisplayProps> = ({
  totalCredits = 12480,
  todayEarned = 320,
  recentEvents = [
    { id: '1', type: 'answer', amount: 120, description: 'Answered: Vietnam business registration', timestamp: '2 min ago' },
    { id: '2', type: 'verify', amount: 80, description: 'Verified: FPT Internet 500Mbps claim', timestamp: '15 min ago' },
    { id: '3', type: 'teach', amount: 250, description: 'Taught: Myanmar P2P USDT trading', timestamp: '1 hour ago' },
    { id: '4', type: 'compute', amount: 40, description: 'Shared GPU: 2 hours', timestamp: '3 hours ago' },
    { id: '5', type: 'knowledge', amount: 200, description: 'Added knowledge: Danang living costs', timestamp: '5 hours ago' },
  ]
}) => {
  return (
    <section className="rewards-section">
      <div className="section-header">
        <h2 className="section-title">
          <span className="token-icon">💰</span>
          TOKEN BANK
        </h2>
      </div>

      <div className="balance-card">
        <div className="balance-main">
          <span className="balance-label">Balance</span>
          <span className="balance-amount">{totalCredits.toLocaleString()} Credits</span>
        </div>
        <div className="today-earned">
          <span className="earned-label">Earned Today</span>
          <span className="earned-amount">+{todayEarned}</span>
        </div>
      </div>

      <div className="contributions-breakdown">
        <h3 className="breakdown-title">Contributions</h3>
        <div className="contribution-items">
          {[
            { type: 'answer', count: 1842, total: 1842 * 120 },
            { type: 'verify', count: 492, total: 492 * 80 },
            { type: 'teach', count: 128, total: 128 * 250 },
            { type: 'compute', count: 83, total: 83 * 40 },
            { type: 'mcp', count: 12, total: 12 * 500 },
            { type: 'knowledge', count: 0, total: 0 },
          ].map(item => (
            <div key={item.type} className="contribution-row">
              <span className="contrib-icon">{ICONS[item.type]}</span>
              <span className="contrib-label">{LABELS[item.type]}</span>
              <span className="contrib-count">{item.count}</span>
              <span className="contrib-reward">+{item.total.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="total-contribution">
          <span>Total Contribution</span>
          <span className="total-amount">98,421</span>
        </div>
      </div>

      <div className="recent-rewards">
        <h3 className="breakdown-title">Recent Rewards</h3>
        <div className="reward-events">
          {recentEvents.map(event => (
            <div key={event.id} className="reward-event">
              <span className="event-icon">{ICONS[event.type]}</span>
              <div className="event-info">
                <span className="event-desc">{event.description}</span>
                <span className="event-time">{event.timestamp}</span>
              </div>
              <span className="event-amount">+{event.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};