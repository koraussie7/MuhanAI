import React from 'react';

interface NetworkPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const NetworkPanel: React.FC<NetworkPanelProps> = ({ isOpen = true, onClose }) => {
  const networkStats = {
    agents: 1284,
    humanAgents: 7542,
    llmProviders: 328,
    mcpServers: 4821,
    computeNodes: 12438,
    knowledgeRecords: '18.4M',
  };

  const activeTasks = [
    { type: 'Researching', count: 234, color: '#3b82f6' },
    { type: 'Coding', count: 189, color: '#8b5cf6' },
    { type: 'Verification', count: 156, color: '#10b981' },
    { type: 'Translation', count: 98, color: '#f59e0b' },
    { type: 'Data Analysis', count: 67, color: '#ef4444' },
  ];

  const networkActivity = [
    { type: 'Agent Cast', count: 1482, icon: '📡' },
    { type: 'Human Answers', count: 382, icon: '👤' },
    { type: 'Knowledge Added', count: 721, icon: '📚' },
    { type: 'Verification', count: 291, icon: '✅' },
    { type: 'Compute Shared', count: 83, icon: '⚡' },
  ];

  if (!isOpen) return null;

  return (
    <aside className="network-panel">
      <div className="panel-header">
        <h3 className="panel-title">NETWORK STATUS</h3>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">✕</button>
      </div>

      <div className="panel-section">
        <h4 className="panel-subtitle">Nodes Online</h4>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon">🤖</span>
            <div className="stat-info">
              <span className="stat-value">{networkStats.agents.toLocaleString()}</span>
              <span className="stat-label">Agents</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">👤</span>
            <div className="stat-info">
              <span className="stat-value">{networkStats.humanAgents.toLocaleString()}</span>
              <span className="stat-label">Human Agents</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🧠</span>
            <div className="stat-info">
              <span className="stat-value">{networkStats.llmProviders}</span>
              <span className="stat-label">LLM Providers</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🔌</span>
            <div className="stat-info">
              <span className="stat-value">{networkStats.mcpServers.toLocaleString()}</span>
              <span className="stat-label">MCP Servers</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">⚡</span>
            <div className="stat-info">
              <span className="stat-value">{networkStats.computeNodes.toLocaleString()}</span>
              <span className="stat-label">Compute Nodes</span>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">📚</span>
            <div className="stat-info">
              <span className="stat-value">{networkStats.knowledgeRecords}</span>
              <span className="stat-label">Knowledge</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h4 className="panel-subtitle">Active Tasks</h4>
        <div className="task-bars">
          {activeTasks.map(task => (
            <div key={task.type} className="task-bar">
              <div className="task-header">
                <span className="task-name">{task.type}</span>
                <span className="task-count">{task.count}</span>
              </div>
              <div className="task-track">
                <div
                  className="task-fill"
                  style={{ width: `${(task.count / Math.max(activeTasks[0]?.count ?? 1, 1)) * 100}%`, backgroundColor: task.color }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <h4 className="panel-subtitle">Network Activity (24h)</h4>
        <div className="activity-list">
          {networkActivity.map(activity => (
            <div key={activity.type} className="activity-item">
              <span className="activity-icon">{activity.icon}</span>
              <div className="activity-info">
                <span className="activity-name">{activity.type}</span>
                <span className="activity-count">{activity.count.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};