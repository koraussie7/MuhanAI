import React from 'react';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
  activePath?: string;
  onItemClick?: (path: string) => void;
}

const NAV_SECTIONS = [
  {
    id: 'network',
    label: 'NETWORK',
    items: [
      { path: '/', label: 'Dashboard', icon: '🏠' },
      { path: '/agent-mesh', label: 'Agent Mesh', icon: '🕸️' },
      { path: '/agent-cast', label: 'Agent Cast', icon: '📡' },
      { path: '/agents', label: 'Agents', icon: '🤖' },
      { path: '/human-agents', label: 'Human Agents', icon: '👤' },
      { path: '/p2p-network', label: 'P2P Network', icon: '🌐' },
    ]
  },
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    items: [
      { path: '/knowledge', label: 'Knowledge', icon: '📚' },
      { path: '/knowledge-graph', label: 'Knowledge Graph', icon: '🕸️' },
      { path: '/search', label: 'Search', icon: '🔍' },
      { path: '/verification', label: 'Verification', icon: '✅' },
    ]
  },
  {
    id: 'resources',
    label: 'AI RESOURCES',
    items: [
      { path: '/llm-mesh', label: 'LLM Mesh', icon: '🧠' },
      { path: '/mcp-skills', label: 'MCP / Skills', icon: '🔌' },
      { path: '/compute-mesh', label: 'Compute Mesh', icon: '⚡' },
      { path: '/models', label: 'Models', icon: '📦' },
    ]
  },
  {
    id: 'marketplace',
    label: 'MARKETPLACE',
    items: [
      { path: '/marketplace/agents', label: 'Agents', icon: '🤖' },
      { path: '/marketplace/human-experts', label: 'Human Experts', icon: '👤' },
      { path: '/marketplace/mcp', label: 'MCP', icon: '🔌' },
      { path: '/marketplace/knowledge', label: 'Knowledge', icon: '📚' },
      { path: '/marketplace/compute', label: 'Compute', icon: '⚡' },
    ]
  },
  {
    id: 'economy',
    label: 'ECONOMY',
    items: [
      { path: '/token-bank', label: 'Token Bank', icon: '💰' },
      { path: '/contributions', label: 'Contributions', icon: '📊' },
      { path: '/reputation', label: 'Reputation', icon: '⭐' },
    ]
  },
  {
    id: 'workspace',
    label: 'WORKSPACE',
    items: [
      { path: '/projects', label: 'Projects', icon: '📁' },
      { path: '/tasks', label: 'Tasks', icon: '✓' },
      { path: '/workflows', label: 'Workflows', icon: '🔄' },
    ]
  },
  {
    id: 'system',
    label: 'SYSTEM',
    items: [
      { path: '/network-monitor', label: 'Network Monitor', icon: '📈' },
      { path: '/settings', label: 'Settings', icon: '⚙️' },
    ]
  }
];

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed = false, onToggle, activePath = '/', onItemClick }) => {
  const renderSection = (section: typeof NAV_SECTIONS[0]) => (
    <div key={section.id} className="nav-section">
      <div className="nav-section-title">
        {section.label}
        {!isCollapsed && <span className="section-chevron">▼</span>}
      </div>
      <nav className="nav-items">
        {section.items.map((item) => (
          <button
            key={item.path}
            type="button"
            className={`nav-item ${activePath === item.path ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`}
            title={isCollapsed ? item.label : undefined}
            onClick={() => onItemClick?.(item.path)}
          >
            <span className="nav-icon">{item.icon}</span>
            {!isCollapsed && <span className="nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!isCollapsed && (
          <div className="logo">
            <span className="logo-icon">🧠</span>
            <span className="logo-text">MUHAN AI</span>
          </div>
        )}
        {isCollapsed && (
          <div className="logo-collapsed">
            <span className="logo-icon">🧠</span>
          </div>
        )}
        <button
          className="collapse-toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      <div className="sidebar-nav">
        {NAV_SECTIONS.map(renderSection)}
      </div>

      <div className="sidebar-footer">
        {!isCollapsed && (
          <div className="network-status-mini">
            <span className="status-indicator online"></span>
            <span className="status-text">1,284 Agents Online</span>
          </div>
        )}
        <div className="user-menu-mini">
          <div className="user-avatar">B</div>
          {!isCollapsed && <span className="user-name">Brian</span>}
        </div>
      </div>
    </aside>
  );
};