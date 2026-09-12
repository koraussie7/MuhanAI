"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Bot,
  Folder,
  Terminal,
  Globe,
  Cpu,
  Settings,
  Code,
  Power,
  Search,
  User,
  Lock,
  RotateCcw,
  Sparkles,
  X,
  Package,
} from "lucide-react";
import { useI18n } from "@agentmesh/web/i18n.js";
import { getMenuTranslation } from "@agentmesh/web/components/menu-i18n.js";

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  category: "AI & Agents" | "System" | "Productivity";
}

export const APPS: AppDefinition[] = [
  {
    id: "chat",
    name: "MuhanAI Chat",
    description: "Token-Free AI Assistant & LLM Router",
    icon: <Bot className="text-emerald-400" size={24} />,
    category: "AI & Agents",
  },
  {
    id: "files",
    name: "File Explorer",
    description: "Knowledge Lake & Virtual File System",
    icon: <Folder className="text-yellow-400" size={24} />,
    category: "System",
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "MuhanAI Mesh Shell & WASM Environment",
    icon: <Terminal className="text-cyan-400" size={24} />,
    category: "System",
  },
  {
    id: "browser",
    name: "Web Browser",
    description: "Decentralized P2P Web & Search",
    icon: <Globe className="text-blue-400" size={24} />,
    category: "Productivity",
  },
  {
    id: "engine",
    name: "AI Engine Monitor",
    description: "WebGPU / WASM Local Inference Telemetry",
    icon: <Cpu className="text-purple-400" size={24} />,
    category: "AI & Agents",
  },
  {
    id: "editor",
    name: "Code Studio",
    description: "Zero-token Code & Markdown Editor",
    icon: <Code className="text-pink-400" size={24} />,
    category: "Productivity",
  },
  {
    id: "bitterbot",
    name: "Bitterbot Agent",
    description: "Token-Free Autonomous Agent & P2P Task Runner",
    icon: <Package className="text-amber-400" size={24} />,
    category: "AI & Agents",
  },
  {
    id: "settings",
    name: "System Settings",
    description: "Preferences, Themes & P2P Keys",
    icon: <Settings className="text-gray-400" size={24} />,
    category: "System",
  },
];

interface StartMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchApp: (appId: string) => void;
  userName?: string;
}

export function StartMenu({
  isOpen,
  onClose,
  onLaunchApp,
  userName = "MuhanAI User",
}: StartMenuProps) {
  const { lang } = useI18n();
  const menuI18n = getMenuTranslation(lang);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Avoid immediately closing if clicking the start button itself
        const target = e.target as HTMLElement | null;
        if (target?.closest(".start-button")) return;
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredApps = APPS.filter((app) => {
    const matchesQuery =
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === "all" || app.category === activeCategory;
    return matchesQuery && matchesCategory;
  });

  const categories = ["all", "AI & Agents", "System", "Productivity"];

  return (
    <div className="start-menu" ref={menuRef}>
      {/* Top Bar: Search Input */}
      <div className="start-menu-header">
        <div className="start-search-box">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder={menuI18n.desktop?.searchPlaceholder || "앱, 도구, 설정 검색..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="start-search-input"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-gray-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="start-menu-tabs">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`start-tab-btn ${activeCategory === cat ? "active" : ""}`}
          >
            {cat === "all"
              ? menuI18n.desktop?.allApps || "전체 앱"
              : menuI18n.desktop?.categories[cat] || cat}
          </button>
        ))}
      </div>

      {/* App Grid */}
      <div className="start-menu-content">
        <div className="start-apps-grid">
          {filteredApps.map((app) => (
            <button
              key={app.id}
              type="button"
              className="start-app-card"
              onClick={() => {
                onLaunchApp(app.id);
                onClose();
              }}
            >
              <div className="start-app-icon-wrap">{app.icon}</div>
              <div className="start-app-info">
                <div className="start-app-name">{app.name}</div>
                <div className="start-app-desc">{app.description}</div>
              </div>
            </button>
          ))}
          {filteredApps.length === 0 && (
            <div className="start-empty-results">
              <p className="text-gray-400 text-sm">
                &quot;{searchQuery}&quot;에 대한 앱을 찾을 수 없습니다
              </p>
            </div>
          )}
        </div>

        {/* Quick Features Highlight */}
        <div className="start-pinned-section">
          <div className="start-section-title flex items-center gap-2">
            <Sparkles size={14} className="text-amber-400" />
            <span>{menuI18n.desktop?.quickLaunch || "빠른 실행"}</span>
          </div>
          <div className="start-quick-actions">
            <button
              type="button"
              className="quick-action-pill"
              onClick={() => {
                onLaunchApp("chat");
                onClose();
              }}
            >
              <Bot size={14} /> {menuI18n.desktop?.apps?.chat?.name || "AI 챗 시작"}
            </button>
            <button
              type="button"
              className="quick-action-pill"
              onClick={() => {
                onLaunchApp("terminal");
                onClose();
              }}
            >
              <Terminal size={14} /> {menuI18n.desktop?.apps?.terminal?.name || "셸 열기"}
            </button>
            <button
              type="button"
              className="quick-action-pill"
              onClick={() => {
                onLaunchApp("engine");
                onClose();
              }}
            >
              <Cpu size={14} /> {menuI18n.desktop?.apps?.engine?.name || "엔진 상태"}
            </button>
          </div>
        </div>
      </div>

      {/* Footer: User profile and System Power controls */}
      <div className="start-menu-footer">
        <div className="start-user-info">
          <div className="start-user-avatar">
            <User size={16} />
          </div>
          <span className="start-user-name">{userName}</span>
        </div>

        <div className="start-power-actions">
          <button
            type="button"
            className="power-btn"
            title={menuI18n.desktop?.lock || "잠금"}
            onClick={onClose}
          >
            <Lock size={15} />
          </button>
          <button
            type="button"
            className="power-btn"
            title="재시작"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            className="power-btn power-off"
            title={menuI18n.desktop?.closeAll || "모든 창 닫기"}
            onClick={onClose}
          >
            <Power size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
