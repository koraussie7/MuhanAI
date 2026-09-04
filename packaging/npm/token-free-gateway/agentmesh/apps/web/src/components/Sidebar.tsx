import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { sidebarSections, type SectionConfig } from "../routes/section-config";

// Sidebar navigation is generated from the route registry
// (routes/section-config.tsx). Active state is derived from the router
// location via NavLink, not from props.

interface SidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? "nav-item active" : "nav-item";

function NavButton({
  section,
  label,
  isCollapsed,
}: {
  section: SectionConfig;
  label: string;
  isCollapsed: boolean;
}) {
  return (
    <NavLink
      to={section.path}
      end={section.path === "/"}
      className={navClass}
      title={isCollapsed ? label : undefined}
    >
      <span className="nav-icon">{section.icon}</span>
      {!isCollapsed && <span className="nav-label">{label}</span>}
    </NavLink>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed: collapsedProp = false, onToggle }) => {
  const [collapsedState, setCollapsedState] = useState(false);
  const isCollapsed = onToggle ? collapsedProp : collapsedState;
  const toggle = onToggle ?? (() => setCollapsedState((v) => !v));

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
          onClick={toggle}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      <div className="sidebar-nav">
        {sidebarSections().map(({ group, items }) => (
          <div key={group.id} className="nav-section">
            <div className="nav-section-title">
              {group.label}
              {!isCollapsed && <span className="section-chevron">▼</span>}
            </div>
            <nav className="nav-items">
              {items.map(({ section, label }) => (
                <NavButton
                  key={`${group.id}-${section.id}`}
                  section={section}
                  label={label}
                  isCollapsed={isCollapsed}
                />
              ))}
            </nav>
          </div>
        ))}
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
