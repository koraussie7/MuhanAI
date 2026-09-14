import {
	Activity,
	BookOpen,
	Bot,
	CheckCircle2,
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
} from "lucide-react";
import type React from "react";

/**
 * PageBox — boxed page container shared by DashPages / SpecPages.
 *
 * Every menu page renders a <section className="page-box"> so the menu contents
 * are visually organized into a consistent card:
 *
 *   ┌────────────────────────────────────────────┐
 *   │ [icon]  Title              [badge]          │
 *   │         subtitle                            │
 *   ├────────────────────────────────────────────┤
 *   │  (page content)                            │
 *   └────────────────────────────────────────────┘
 *
 * The `iconKey` value matches the route registry (routes.ts) and the sidebar,
 * so the header chip always mirrors the menu item's image/icon.
 */

/** Renders the lucide icon for a menu iconKey (same keys as routes.ts/Sidebar). */
export function renderMenuIcon(key: string): React.ReactNode {
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
		default:
			return null;
	}
}

interface PageBoxProps {
	/** Icon key from routes.ts — mirrors the sidebar menu image. */
	iconKey?: string;
	title: string;
	subtitle?: string;
	badge?: string;
	children: React.ReactNode;
}

/** Consistent boxed page layout shared by every dashboard/spec page. */
export function PageBox({ iconKey, title, subtitle, badge, children }: PageBoxProps) {
	return (
		<section className="page-box">
			<header className="page-box-header">
				<div className="page-box-title-row">
					{iconKey && <span className="page-box-icon">{renderMenuIcon(iconKey)}</span>}
					<h2 className="page-box-title">{title}</h2>
					{badge && <span className="page-box-badge">{badge}</span>}
				</div>
				{subtitle && <p className="page-box-subtitle">{subtitle}</p>}
			</header>
			<div className="page-box-body">{children}</div>
		</section>
	);
}
