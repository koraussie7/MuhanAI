import React from 'react';
import {
  LayoutDashboard,
  Radio,
  Network,
  Activity,
  Cpu,
  Layers,
  Database,
  CheckCircle2,
  Search,
  Users,
  Coins,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Bot,
  Zap,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: string;
}

export interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'core',
    title: 'Core & Chat',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} /> },
      { id: 'agent-cast', label: 'Agent Cast', path: '/agent-cast', icon: <Radio size={18} />, badge: 'LIVE' },
      { id: 'agent-mesh', label: 'Agent Mesh', path: '/agent-mesh', icon: <Bot size={18} /> },
    ],
  },
  {
    id: 'network',
    title: 'P2P Network',
    items: [
      { id: 'p2p-network', label: 'P2P Nodes', path: '/network', icon: <Network size={18} /> },
      { id: 'network-monitor', label: 'Telemetry & Pulse', path: '/monitor', icon: <Activity size={18} /> },
    ],
  },
  {
    id: 'resources',
    title: 'Compute & Models',
    items: [
      { id: 'models', label: 'LLM Models', path: '/models', icon: <Sparkles size={18} />, badge: 'Token-Free' },
      { id: 'compute-mesh', label: 'Compute Mesh', path: '/compute-mesh', icon: <Cpu size={18} /> },
      { id: 'mcp-skills', label: 'MCP Tools', path: '/mcp-skills', icon: <Layers size={18} /> },
    ],
  },
  {
    id: 'knowledge',
    title: 'Knowledge Lake',
    items: [
      { id: 'knowledge-lake', label: 'Knowledge Graph', path: '/knowledge', icon: <Database size={18} /> },
      { id: 'verification', label: 'Verification', path: '/verification', icon: <CheckCircle2 size={18} /> },
      { id: 'find', label: 'Cosmic Mesh', path: '/find', icon: <Search size={18} />, badge: 'NEW' },
      { id: 'search', label: 'Mesh Search', path: '/search', icon: <Search size={18} /> },
    ],
  },
  {
    id: 'market',
    title: 'Marketplace',
    items: [
      { id: 'agents-market', label: 'Agent Hub', path: '/marketplace/agents', icon: <Bot size={18} /> },
      { id: 'human-experts', label: 'Human Experts', path: '/marketplace/human-experts', icon: <Users size={18} /> },
      { id: 'compute-market', label: 'Compute Market', path: '/marketplace/compute', icon: <Cpu size={18} /> },
    ],
  },
  {
    id: 'economy',
    title: 'Economy',
    items: [
      { id: 'token-bank', label: 'Token Bank', path: '/token-bank', icon: <Coins size={18} /> },
    ],
  },
  {
    id: 'system',
    title: 'Settings',
    items: [
      { id: 'settings', label: 'Security & Keys', path: '/settings', icon: <Settings size={18} /> },
    ],
  },
];

interface SidebarProps {
  activePath: string;
  onItemClick: (path: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePath,
  onItemClick,
  isCollapsed = false,
  onToggle,
}) => {
  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="brand-container" onClick={() => onItemClick('/')}>
          <div className="brand-logo-icon">
            <Bot size={20} />
          </div>
          {!isCollapsed && (
            <div className="brand-text-wrap">
              <div className="brand-title-row">
                <span className="brand-name">MuhanAI</span>
                <span className="brand-badge">CLINE</span>
              </div>
              <span className="brand-subtitle">Token-Free Mesh</span>
            </div>
          )}
        </div>
        {onToggle && (
          <button
            type="button"
            className="collapse-toggle-btn"
            onClick={onToggle}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Navigation Content */}
      <div className="sidebar-content">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="sidebar-group">
            {!isCollapsed && <span className="sidebar-group-title">{group.title}</span>}
            {group.items.map((item) => {
              const isActive =
                activePath === item.path ||
                (item.path !== '/' && activePath.startsWith(item.path));
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item-btn ${isActive ? 'active' : ''}`}
                  onClick={() => onItemClick(item.path)}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className="nav-item-icon">{item.icon}</span>
                  {!isCollapsed && (
                    <>
                      <span className="nav-item-label">{item.label}</span>
                      {item.badge && <span className="nav-item-badge">{item.badge}</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Profile & Live Mesh Indicator */}
      <div className="sidebar-footer">
        <div className="footer-status-pill">
          <span className="pulse-dot" />
          {!isCollapsed ? (
            <span>P2P Mesh: 12,482 Nodes</span>
          ) : (
            <span>Live</span>
          )}
        </div>

        <div className="footer-user-card" onClick={() => onItemClick('/token-bank')}>
          <div className="user-avatar">
            <Zap size={15} />
          </div>
          {!isCollapsed && (
            <div className="user-info">
              <span className="user-name">Token-Free Active</span>
              <span className="user-credits">12,480 MHT · $0.00</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
