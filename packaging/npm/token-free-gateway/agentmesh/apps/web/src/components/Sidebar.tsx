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
  X,
  Zap,
} from 'lucide-react';
import { NAV_GROUPS as NAV_GROUPS_CONFIG, isNavItemActive, type NavItem as NavItemConfig, type NavGroup as NavGroupConfig } from './sidebar-config.js';
import { CreditBalance } from './CreditBalance.js';

export type { NavItem, NavGroup } from './sidebar-config.js';
export { isNavItemActive } from './sidebar-config.js';

interface NavItem extends NavItemConfig {
  icon: React.ReactNode;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = NAV_GROUPS_CONFIG.map((group) => ({
  id: group.id,
  title: group.title,
  items: group.items.map((item) => ({
    ...item,
    icon: renderIcon(item.iconKey),
  })),
}));

function renderIcon(key: string): React.ReactNode {
  switch (key) {
    case 'layout-dashboard': return <LayoutDashboard size={18} />;
    case 'radio': return <Radio size={18} />;
    case 'bot': return <Bot size={18} />;
    case 'network': return <Network size={18} />;
    case 'activity': return <Activity size={18} />;
    case 'sparkles': return <Sparkles size={18} />;
    case 'cpu': return <Cpu size={18} />;
    case 'layers': return <Layers size={18} />;
    case 'database': return <Database size={18} />;
    case 'check-circle': return <CheckCircle2 size={18} />;
    case 'search': return <Search size={18} />;
    case 'users': return <Users size={18} />;
    case 'coins': return <Coins size={18} />;
    case 'settings': return <Settings size={18} />;
    default: return null;
  }
}

interface SidebarProps {
  activePath: string;
  onItemClick: (path: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePath,
  onItemClick,
  isCollapsed = false,
  onToggle,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="brand-container" onClick={() => { onItemClick('/'); onCloseMobile?.(); }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onCloseMobile && (
            <button
              type="button"
              className="mobile-sidebar-close-btn"
              onClick={onCloseMobile}
              title="Close sidebar"
            >
              <X size={16} />
            </button>
          )}
          {onToggle && (
            <button
              type="button"
              className="collapse-toggle-btn desktop-only"
              onClick={onToggle}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Navigation Content */}
      <div className="sidebar-content">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="sidebar-group">
            {!isCollapsed && <span className="sidebar-group-title">{group.title}</span>}
            {group.items.map((item) => {
              const isActive = isNavItemActive(item.path, activePath);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item-btn ${isActive ? 'active' : ''}`}
                  onClick={() => { onItemClick(item.path); onCloseMobile?.(); }}
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
              <span className="user-credits">
                <CreditBalance userId="demo" variant="inline" />
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
