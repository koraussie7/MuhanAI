import React, { Suspense, useEffect, useState } from "react";
import "./styles/cline-theme.css";
import "./styles/mobile.css";
import { ChevronRight, Globe, Menu, Radio, Search, Sparkles, Zap } from "lucide-react";

function PageSkeleton() {
	const styleId = "page-skeleton-style";
	if (typeof document !== "undefined" && !document.getElementById(styleId)) {
		const style = document.createElement("style");
		style.id = styleId;
		style.textContent = `
			@keyframes shimmer {
				0% { background-position: -200% 0; }
				100% { background-position: 200% 0; }
			}
			.skeleton-loader { background-size: 200% 100%; }
		`;
		document.head.appendChild(style);
	}
	return (
		<div
			style={{
				padding: 40,
				display: "flex",
				flexDirection: "column",
				gap: 16,
				alignItems: "center",
				justifyContent: "center",
				minHeight: "300px",
			}}
		>
			<div
				className="skeleton-loader"
				style={{
					width: 60,
					height: 60,
					borderRadius: 12,
					background:
						"linear-gradient(90deg, var(--cline-border) 25%, var(--cline-primary-bg) 50%, var(--cline-border) 75%)",
					animation: "shimmer 1.5s infinite",
				}}
			/>
			<div
				className="skeleton-loader"
				style={{
					width: "60%",
					height: 24,
					borderRadius: 6,
					background:
						"linear-gradient(90deg, var(--cline-border) 25%, var(--cline-primary-bg) 50%, var(--cline-border) 75%)",
					animation: "shimmer 1.5s infinite",
				}}
			/>
			<div
				className="skeleton-loader"
				style={{
					width: "40%",
					height: 16,
					borderRadius: 4,
					background:
						"linear-gradient(90deg, var(--cline-border) 25%, var(--cline-primary-bg) 50%, var(--cline-border) 75%)",
					animation: "shimmer 1.5s infinite",
				}}
			/>
		</div>
	);
}

import { Dashboard } from "./components/Dashboard";
import { FindPage } from "./components/find/FindPage";
import { getMenuTranslation } from "./components/menu-i18n";
import { RightPanel } from "./components/RightPanel";
import { Sidebar } from "./components/Sidebar";
import { type SupportedLanguage, useI18n } from "./i18n";
import { ROUTES, routeByPath } from "./routes.js";

// Lazy load heavy pages
const P2pNetworkPageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.P2pNetworkPage })),
);
const AgentCastLazy = React.lazy(() =>
	import("./components/AgentCast").then((m) => ({ default: m.AgentCast })),
);
const TokenBankPageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.TokenBankPage })),
);
const WebDesktopPageLazy = React.lazy(() =>
	import("./components/WebDesktopPage").then((m) => ({ default: m.WebDesktopPage })),
);
const AgentMeshPageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.AgentMeshPage })),
);
const KnowledgePageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.KnowledgePage })),
);
const MarketplacePageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.MarketplacePage })),
);
const ModelsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.ModelsPage })),
);
const ComputeMeshPageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.ComputeMeshPage })),
);
const McpSkillsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.McpSkillsPage })),
);
const NetworkMonitorPageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.NetworkMonitorPage })),
);
const VerificationPageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.VerificationPage })),
);
const FederationPanelLazy = React.lazy(() =>
	import("./components/FederationPanel").then((m) => ({ default: m.FederationPanel })),
);
const SemanticVoteLazy = React.lazy(() =>
	import("./components/SemanticVote").then((m) => ({ default: m.SemanticVote })),
);
const AgentsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.AgentsPage })),
);
const HumanAgentsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.HumanAgentsPage })),
);
const ContributionsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.ContributionsPage })),
);
const ReputationPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.ReputationPage })),
);
const ProjectsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.ProjectsPage })),
);
const TasksPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.TasksPage })),
);
const WorkflowsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.WorkflowsPage })),
);
const SettingsPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.SettingsPage })),
);
const HiveBearPanelLazy = React.lazy(() =>
	import("./components/HiveBearPanel").then((m) => ({ default: m.HiveBearPanel })),
);
const PythiaPageLazy = React.lazy(() =>
import("./components/PythiaPage").then((m) => ({ default: m.PythiaPage })),
);
const HappyPageLazy = React.lazy(() =>
	import("./components/HappyPage").then((m) => ({ default: m.HappyPage })),
);
const SearchPageLazy = React.lazy(() =>
	import("./components/SpecPages").then((m) => ({ default: m.SearchPage })),
);
const LlmMeshPageLazy = React.lazy(() =>
	import("./components/DashPages").then((m) => ({ default: m.LlmMeshPage })),
);

/**
 * Single Source of Truth for all routes.
 * Each section has a unique id and path — no duplicates.
 * Legacy paths are handled by redirects in sectionIdFromPath().
 */
const GROUP_LABELS: Record<string, string> = {
	core: "Core",
	network: "Network",
	resources: "Resources",
	knowledge: "Knowledge & Intelligence",
	marketplace: "Marketplace",
	economy: "Economy",
	workspace: "Workspace",
	system: "System",
};

const SECTIONS = ROUTES.map((route) => ({
	id: route.id,
	path: route.path,
	label: route.label,
	category: GROUP_LABELS[route.group] ?? route.group,
}));

/**
 * Legacy path redirects — maps old/duplicate paths to canonical section IDs.
 * This ensures backward compatibility with bookmarked links.
 */
const LEGACY_PATH_REDIRECTS: Record<string, string> = {
	// P2P Network duplicates
	"/p2p-network": "p2p-network",
	// Network Monitor duplicates
	"/network-monitor": "network-monitor",
	// Knowledge Graph duplicates
	"/knowledge-graph": "knowledge",
};

const IMPLEMENTED_SECTIONS = new Set(SECTIONS.map((s) => s.id));

function sectionIdFromPath(path: string) {
	const cleanPath = path.split("?")[0] || "/";

	// Check legacy redirects first (backward compatibility)
	if (cleanPath in LEGACY_PATH_REDIRECTS) {
		return LEGACY_PATH_REDIRECTS[cleanPath]!;
	}

	if (cleanPath === "/dashboard") {
		return "dashboard";
	}
	if (cleanPath === "/" || cleanPath === "/find" || cleanPath === "") {
		return "find";
	}
	if (typeof window !== "undefined") {
		const host = window.location.hostname;
		if (host === "find.muhanai.com" || host.startsWith("find.")) {
			return "find";
		}
	}
	const found = routeByPath(cleanPath);
	if (found) return found.id;
	const bare = cleanPath.replace(/^\//, "");
	return bare || "find";
}

function pathFromSectionId(id: string) {
	return ROUTES.find((route) => route.id === id)?.path ?? `/${id}`;
}

export function App() {
	const { lang, setLanguage, t, supportedLanguages } = useI18n();
	const menuI18n = getMenuTranslation(lang);
	const [activeSection, setActiveSection] = useState(() => {
		if (typeof window !== "undefined") {
			return sectionIdFromPath(window.location.pathname);
		}
		return "dashboard";
	});

	const [isCollapsed, setIsCollapsed] = useState(() => {
		try {
			return localStorage.getItem("cline_sidebar_collapsed") === "true";
		} catch {
			return false;
		}
	});

	const [searchQuery, setSearchQuery] = useState("");
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	const toggleSidebar = () => {
		setIsCollapsed((prev) => {
			const next = !prev;
			try {
				localStorage.setItem("cline_sidebar_collapsed", String(next));
			} catch {}
			return next;
		});
	};

	const navigate = (path: string) => {
		setIsMobileMenuOpen(false);
		const nextSection = sectionIdFromPath(path);
		setActiveSection(nextSection);
		window.history.pushState(null, "", path);
	};

	useEffect(() => {
		const onPopState = () => {
			setActiveSection(sectionIdFromPath(window.location.pathname));
		};
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	// 1. Fullscreen Standalone View for find.muhanai.com or /
	if (activeSection === "find") {
		return (
			<FindPage
				onNavigateHome={() => {
					if (
						typeof window !== "undefined" &&
						(window.location.hostname === "find.muhanai.com" ||
							window.location.hostname.startsWith("find."))
					) {
						window.location.href = "https://muhanai.com/dashboard";
					} else {
						navigate("/dashboard");
					}
				}}
			/>
		);
	}

	// 2. DaedalOS Web Desktop - Full Desktop Environment
	if (activeSection === "desktop" || activeSection === "bitterbot") {
		return (
			<Suspense fallback={<PageSkeleton />}>
				<WebDesktopPageLazy initialApp={activeSection === "bitterbot" ? "bitterbot" : undefined} />
			</Suspense>
		);
	}

	const currentSectionMeta = SECTIONS.find((s) => s.id === activeSection) ?? {
		id: activeSection,
		label: activeSection,
		category: "MuhanAI",
		path: `/${activeSection}`,
	};

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (searchQuery.trim()) {
			navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
		}
	};

	return (
		<div className="app-shell">
			{/* Sidebar with clean menu items matching NAV_GROUPS */}
			<Sidebar
				activePath={pathFromSectionId(activeSection)}
				onItemClick={navigate}
				isCollapsed={isCollapsed}
				onToggle={toggleSidebar}
				isMobileOpen={isMobileMenuOpen}
				onCloseMobile={() => setIsMobileMenuOpen(false)}
			/>
			{isMobileMenuOpen && (
				<div className="mobile-drawer-backdrop" onClick={() => setIsMobileMenuOpen(false)} />
			)}

			{/* Main Wrapper */}
			<div className="main-wrapper">
				{/* Top Header Bar */}
				<header className="top-bar">
					<div className="top-bar-left">
						<button
							type="button"
							className="mobile-menu-toggle-btn"
							onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
							aria-label="Open Navigation"
						>
							<Menu size={18} />
						</button>
						<div className="breadcrumb-trail">
							<span className="breadcrumb-root">MuhanAI</span>
							<ChevronRight size={13} className="breadcrumb-separator" />
							<span className="breadcrumb-root">
								{menuI18n.groups[currentSectionMeta.category.toLowerCase()] ||
									currentSectionMeta.category}
							</span>
							<ChevronRight size={13} className="breadcrumb-separator" />
							<span className="breadcrumb-current">
								{menuI18n.items[currentSectionMeta.id] || currentSectionMeta.label}
							</span>
						</div>
					</div>

					<div className="top-bar-right">
						{/* Global Search Bar */}
						<form className="top-search-wrap" onSubmit={handleSearchSubmit}>
							<Search size={14} className="top-search-icon" />
							<input
								type="text"
								placeholder={t.ui.searchPlaceholder}
								className="top-search-input"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
							<span className="top-search-kbd">⌘K</span>
						</form>

						{/* Launch Cosmic Mesh / find.muhanai.com Button */}
						<button
							type="button"
							className="top-action-btn"
							style={{
								background:
									"linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(99, 102, 241, 0.25))",
								borderColor: "rgba(56, 189, 248, 0.4)",
								color: "#38bdf8",
							}}
							onClick={() => navigate("/")}
							title="Launch find.muhanai.com Cosmic Knowledge Mesh"
						>
							<Sparkles size={13} />
							<span>find.muhanai.com</span>
						</button>

						{/* Language Selector Dropdown */}
						<div
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "4px 8px",
								borderRadius: 6,
								background: "rgba(15, 23, 42, 0.65)",
								border: "1px solid rgba(255, 255, 255, 0.12)",
								fontSize: 12,
								color: "#cbd5e1",
							}}
							title={t.ui.language}
						>
							<Globe size={13} style={{ color: "#38bdf8", flexShrink: 0 }} />
							<select
								value={lang}
								onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
								style={{
									background: "transparent",
									border: "none",
									color: "#f8fafc",
									fontSize: 11,
									fontWeight: 500,
									outline: "none",
									cursor: "pointer",
								}}
							>
								{supportedLanguages.map((item) => (
									<option
										key={item.code}
										value={item.code}
										style={{ background: "#090d16", color: "#f8fafc" }}
									>
										{item.flag} {item.native} ({item.code.toUpperCase()})
									</option>
								))}
							</select>
						</div>

						{/* Token-Free Gateway Badge */}
						<div className="gateway-status-badge">
							<Zap size={13} />
							<span>{t.ui.gatewayActive}</span>
						</div>

						{/* Top Launch Button */}
						{activeSection !== "agent-cast" && (
							<button
								type="button"
								className="top-action-btn"
								onClick={() => navigate("/agent-cast")}
							>
								<Radio size={14} />
								{menuI18n.items["agent-cast"] || "Agent Cast"}
							</button>
						)}
					</div>
				</header>

				{/* Content Layout with Telemetry Sidebar */}
				<div className="content-layout">
					<main className="main-content">
						{/* Dashboard: Houses all 지식인 UI and Network Pulse */}
						{activeSection === "dashboard" && <Dashboard onNavigate={navigate} />}

						{/* Core & Chat */}
						{activeSection === "agent-cast" && (
							<Suspense fallback={<PageSkeleton />}>
								<AgentCastLazy />
							</Suspense>
						)}
						{activeSection === "agent-mesh" && (
							<Suspense fallback={<PageSkeleton />}>
								<AgentMeshPageLazy />
							</Suspense>
						)}
						{activeSection === "desktop" && (
							<Suspense fallback={<PageSkeleton />}>
								<WebDesktopPageLazy />
							</Suspense>
						)}
						{activeSection === "agents" && (
							<Suspense fallback={<PageSkeleton />}>
								<AgentsPageLazy />
							</Suspense>
						)}
						{activeSection === "human-agents" && (
							<Suspense fallback={<PageSkeleton />}>
								<HumanAgentsPageLazy />
							</Suspense>
						)}

						{/* Network */}
						{activeSection === "p2p-network" && (
							<Suspense fallback={<PageSkeleton />}>
								<P2pNetworkPageLazy />
							</Suspense>
						)}
						{activeSection === "network-monitor" && (
							<Suspense fallback={<PageSkeleton />}>
								<NetworkMonitorPageLazy />
							</Suspense>
						)}

						{/* Resources */}
						{activeSection === "models" && (
							<Suspense fallback={<PageSkeleton />}>
								<ModelsPageLazy />
							</Suspense>
						)}
						{activeSection === "compute-mesh" && (
							<Suspense fallback={<PageSkeleton />}>
								<ComputeMeshPageLazy />
							</Suspense>
						)}
						{activeSection === "mcp-skills" && (
							<Suspense fallback={<PageSkeleton />}>
								<McpSkillsPageLazy />
							</Suspense>
						)}
						{activeSection === "llm-mesh" && (
							<Suspense fallback={<PageSkeleton />}>
								<LlmMeshPageLazy />
							</Suspense>
						)}

						{/* Intelligence */}
						{activeSection === "knowledge" && (
							<Suspense fallback={<PageSkeleton />}>
								<KnowledgePageLazy />
							</Suspense>
						)}
						{activeSection === "verification" && (
							<Suspense fallback={<PageSkeleton />}>
								<VerificationPageLazy />
							</Suspense>
						)}
						{activeSection === "search" && (
							<Suspense fallback={<PageSkeleton />}>
								<SearchPageLazy />
							</Suspense>
						)}

						{/* Marketplace */}
						{(activeSection === "agents-market" ||
							activeSection === "human-experts" ||
							activeSection === "mcp-market" ||
							activeSection === "knowledge-market" ||
							activeSection === "compute-market") && (
							<Suspense fallback={<PageSkeleton />}>
								<MarketplacePageLazy
									defaultTab={
										activeSection === "human-experts"
											? "human"
											: activeSection === "mcp-market"
												? "mcp"
												: activeSection === "knowledge-market"
													? "knowledge"
													: activeSection === "compute-market"
														? "compute"
														: "agents"
									}
								/>
							</Suspense>
						)}

						{/* Economy */}
						{activeSection === "token-bank" && (
							<Suspense fallback={<PageSkeleton />}>
								<TokenBankPageLazy />
							</Suspense>
						)}
						{activeSection === "contributions" && (
							<Suspense fallback={<PageSkeleton />}>
								<ContributionsPageLazy />
							</Suspense>
						)}
						{activeSection === "reputation" && (
							<Suspense fallback={<PageSkeleton />}>
								<ReputationPageLazy />
							</Suspense>
						)}

						{/* Workspace */}
						{activeSection === "projects" && (
							<Suspense fallback={<PageSkeleton />}>
								<ProjectsPageLazy />
							</Suspense>
						)}
						{activeSection === "tasks" && (
							<Suspense fallback={<PageSkeleton />}>
								<TasksPageLazy />
							</Suspense>
						)}
						{activeSection === "workflows" && (
							<Suspense fallback={<PageSkeleton />}>
								<WorkflowsPageLazy />
							</Suspense>
						)}

						{/* System */}
						{activeSection === "settings" && (
							<Suspense fallback={<PageSkeleton />}>
								<SettingsPageLazy />
							</Suspense>
						)}

						{/* Semantic Intelligence & Federation */}
						{activeSection === "semantic-vote" && (
							<Suspense fallback={<PageSkeleton />}>
								<SemanticVoteLazy onSubmit={(route) => navigate(`/agent-cast?route=${route}`)} />
							</Suspense>
						)}
						{activeSection === "hivebear" && (
							<Suspense fallback={<PageSkeleton />}>
								<HiveBearPanelLazy />
							</Suspense>
						)}
						{activeSection === "federation" && (
							<Suspense fallback={<PageSkeleton />}>
								<FederationPanelLazy />
							</Suspense>
						)}

						{/* Happy Coder — Token-Free Gateway for Claude Code & Codex */}
						{activeSection === "happy" && (
							<Suspense fallback={<PageSkeleton />}>
								<HappyPageLazy />
							</Suspense>
						)}
							{/* Pythia */}
							{activeSection === "pythia" && (
								<Suspense fallback={<PageSkeleton />}>
									<PythiaPageLazy />
								</Suspense>
							)}

						{!IMPLEMENTED_SECTIONS.has(activeSection) && (
							<div className="placeholder-page" style={{ padding: 40, textAlign: "center" }}>
								<h2>
									{SECTIONS.find((section) => section.id === activeSection)?.label ?? activeSection}
								</h2>
								<p style={{ color: "var(--cline-text-muted)" }}>이 섹션은 준비 중입니다.</p>
							</div>
						)}
					</main>

					{/* Right Telemetry Panel */}
					<RightPanel />
				</div>
			</div>
		</div>
	);
}

export default App;
