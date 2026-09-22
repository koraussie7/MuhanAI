import {
	Ghost,
	Code2,
	Activity,
	BookOpen,
	Bot,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Coins,
	Cpu,
	Database,
	FolderGit,
	GitBranch,
	GitMerge,
	Layers,
	LayoutDashboard,
	ListTodo,
	Monitor,
	Network,
	Package,
	Radio,
	Search,
	Settings,
	Smartphone,
	Sparkles,
	Star,
	Users,
	Vote,
	X,
	Zap,
} from "lucide-react";
import type React from "react";
import { useI18n } from "../i18n.js";
import { formatPeerCountBare } from "../lib/mesh-stats.js";
import { useMeshPulse } from "../hooks/useMeshPulse.js";
import { CreditBalance } from "./CreditBalance.js";
import { getMenuTranslation } from "./menu-i18n.js";
import {
	isNavItemActive,
	NAV_GROUPS as NAV_GROUPS_CONFIG,
	type NavItem as NavItemConfig,
} from "./sidebar-config.js";

export type { NavGroup, NavItem } from "./sidebar-config.js";
export { isNavItemActive } from "./sidebar-config.js";

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
		case "layout-dashboard":
			return <LayoutDashboard size={18} />;
		case "radio":
			return <Radio size={18} />;
		case "package":
			return <Package size={18} />;
		case "bot":
			return <Bot size={18} />;
		case "network":
			return <Network size={18} />;
		case "activity":
			return <Activity size={18} />;
		case "sparkles":
			return <Sparkles size={18} />;
		case "cpu":
			return <Cpu size={18} />;
		case "layers":
			return <Layers size={18} />;
		case "database":
			return <Database size={18} />;
		case "check-circle":
			return <CheckCircle2 size={18} />;
		case "search":
			return <Search size={18} />;
		case "users":
			return <Users size={18} />;
		case "coins":
			return <Coins size={18} />;
		case "settings":
			return <Settings size={18} />;
		case "smartphone":
			return <Smartphone size={18} />;
		case "monitor":
			return <Monitor size={18} />;
		case "vote":
			return <Vote size={18} />;
		case "git-merge":
			return <GitMerge size={18} />;
		case "book-open":
			return <BookOpen size={18} />;
		case "folder-git":
			return <FolderGit size={18} />;
		case "list-todo":
			return <ListTodo size={18} />;
		case "star":
			return <Star size={18} />;
		case "git-branch":
			return <GitBranch size={18} />;
		case "python":
			return <Code2 size={18} />;
		case "ghost":
			return <Ghost size={18} />;
		case "robot":
			return <Bot size={18} />;
		default:
			return null;
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
	const { lang } = useI18n();
	const menuI18n = getMenuTranslation(lang);
	const { stats } = useMeshPulse();

	return (
		<aside
			className={`sidebar ${isCollapsed ? "collapsed" : ""} ${isMobileOpen ? "mobile-open" : ""}`}
		>
			{/* Brand Header */}
			<div className="sidebar-header">
				<div
					className="brand-container"
					onClick={() => {
						onItemClick("/");
						onCloseMobile?.();
					}}
				>
					<div className="brand-logo-icon">
						<Bot size={20} />
					</div>
					{!isCollapsed && (
						<div className="brand-text-wrap">
							<div className="brand-title-row">
								<span className="brand-name">MuhanAI</span>
								<span className="brand-badge">CLINE</span>
							</div>
							<span className="brand-subtitle">{menuI18n.footer.brandSubtitle}</span>
						</div>
					)}
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
							title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
							aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						>
							{isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
						</button>
					)}
				</div>
			</div>

			{/* Navigation Content */}
			<div className="sidebar-content">
				{NAV_GROUPS.map((group) => {
					const groupTitle = menuI18n.groups[group.id] || group.title;
					return (
						<div key={group.id} className="sidebar-group">
							{!isCollapsed && <span className="sidebar-group-title">{groupTitle}</span>}
							{group.items.map((item) => {
								const isActive = isNavItemActive(item.path, activePath);
								const itemLabel = menuI18n.items[item.id] || item.label;
								const badgeLabel = item.badge
									? menuI18n.badges?.[item.badge] || item.badge
									: undefined;
								return (
									<button
										key={item.id}
										type="button"
										className={`nav-item-btn ${isActive ? "active" : ""}`}
										onClick={() => {
											onItemClick(item.path);
											onCloseMobile?.();
										}}
										title={isCollapsed ? itemLabel : undefined}
									>
										<span className="nav-item-icon">{item.icon}</span>
										{!isCollapsed && (
											<>
												<span className="nav-item-label">{itemLabel}</span>
												{badgeLabel && <span className="nav-item-badge">{badgeLabel}</span>}
											</>
										)}
									</button>
								);
							})}
						</div>
					);
				})}
			</div>

			{/* Footer Profile & Live Mesh Indicator */}
			<div className="sidebar-footer">
				<div className="footer-status-pill">
					<span className="pulse-dot" />
					{!isCollapsed ? (
						<span>
							{menuI18n.footer.peerMesh}: {formatPeerCountBare(stats.peers ?? stats.agentsOnline)}{" "}
								{menuI18n.footer.nodes}
						</span>
					) : (
						<span>{menuI18n.footer.live}</span>
					)}
				</div>

				<div className="footer-user-card" onClick={() => onItemClick("/token-bank")}>
					<div className="user-avatar">
						<Zap size={15} />
					</div>
					{!isCollapsed && (
						<div className="user-info">
							<span className="user-name">{menuI18n.footer.tokenFreeActive}</span>
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
