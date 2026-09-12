import type React from "react";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useI18n } from "../i18n.js";
import { getMenuTranslation } from "./menu-i18n.js";
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
	Wifi,
	Battery,
	Volume2,
	Play,
	FileText,
	CheckCircle2,
	ArrowLeft,
	ArrowRight,
	RefreshCw,
	ExternalLink,
	Package,
} from "lucide-react";

interface WindowItem {
	id: string;
	title: string;
	icon: ReactNode;
	content: ReactNode;
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;
}

const DESKTOP_APPS = [
	{
		id: "chat",
		name: "MuhanAI Chat",
		description: "Token-Free AI Assistant & LLM Router",
		icon: <Bot size={22} className="text-emerald-400" />,
		category: "AI & Agents",
	},
	{
		id: "files",
		name: "File Explorer",
		description: "Knowledge Lake & Virtual File System",
		icon: <Folder size={22} className="text-yellow-400" />,
		category: "System",
	},
	{
		id: "terminal",
		name: "Terminal",
		description: "MuhanAI Mesh Shell & WASM Environment",
		icon: <Terminal size={22} className="text-cyan-400" />,
		category: "System",
	},
	{
		id: "browser",
		name: "Web Browser",
		description: "Decentralized P2P Web & Search",
		icon: <Globe size={22} className="text-blue-400" />,
		category: "Productivity",
	},
	{
		id: "engine",
		name: "AI Engine Monitor",
		description: "WebGPU / WASM Local Inference Telemetry",
		icon: <Cpu size={22} className="text-purple-400" />,
		category: "AI & Agents",
	},
	{
		id: "editor",
		name: "Code Studio",
		description: "Zero-token Code & Markdown Editor",
		icon: <Code size={22} className="text-pink-400" />,
		category: "Productivity",
	},
	{
		id: "bitterbot",
		name: "Bitterbot Agent",
		description: "Token-Free Autonomous Agent & P2P Task Runner",
		icon: <Package size={22} className="text-amber-400" />,
		category: "AI & Agents",
	},
	{
		id: "settings",
		name: "System Settings",
		description: "Preferences, Themes & P2P Keys",
		icon: <Settings size={22} className="text-gray-400" />,
		category: "System",
	},
];

export const WebDesktopPage: React.FC = () => {
	const { lang } = useI18n();
	const menuI18n = getMenuTranslation(lang);
	const [windows, setWindows] = useState<WindowItem[]>([]);
	const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
	const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeCategory, setActiveCategory] = useState("all");
	const [topZIndex, setTopZIndex] = useState(100);
	const [time, setTime] = useState(new Date());

	const localizedApps = DESKTOP_APPS.map((app) => {
		const appTrans = menuI18n.desktop?.apps[app.id];
		return {
			...app,
			name: appTrans?.name || app.name,
			description: appTrans?.description || app.description,
			categoryLabel:
				menuI18n.desktop?.categories[app.category] || app.category,
		};
	});

	// Update clock every second
	useEffect(() => {
		const timer = setInterval(() => setTime(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	// Bring window to front
	const focusWindow = (id: string) => {
		const nextZ = topZIndex + 1;
		setTopZIndex(nextZ);
		setActiveWindowId(id);
		setWindows((prev) =>
			prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
		);
	};

	// Open or focus an app
	const launchApp = (appId: string) => {
		setIsStartMenuOpen(false);
		const existing = windows.find((w) => w.id === appId);
		if (existing) {
			focusWindow(appId);
			return;
		}

		const app = localizedApps.find((a) => a.id === appId);
		const nextZ = topZIndex + 1;
		setTopZIndex(nextZ);
		setActiveWindowId(appId);

		const offset = (windows.length % 5) * 30;

		const newWindow: WindowItem = {
			id: appId,
			title: app?.name ?? appId,
			icon: app?.icon ?? <Bot size={18} />,
			content: renderAppContent(appId),
			x: 140 + offset,
			y: 60 + offset,
			width: appId === "terminal" ? 560 : 620,
			height: appId === "terminal" ? 360 : 420,
			zIndex: nextZ,
		};

		setWindows((prev) => [...prev, newWindow]);
	};

	const closeWindow = (id: string) => {
		setWindows((prev) => prev.filter((w) => w.id !== id));
		if (activeWindowId === id) {
			setActiveWindowId(null);
		}
	};

	// Start dragging a window
	const startDrag = (e: React.MouseEvent, id: string) => {
		focusWindow(id);
		const targetWindow = windows.find((w) => w.id === id);
		if (!targetWindow) return;

		const startX = e.clientX - targetWindow.x;
		const startY = e.clientY - targetWindow.y;

		const onMouseMove = (moveEvent: MouseEvent) => {
			const newX = Math.max(0, moveEvent.clientX - startX);
			const newY = Math.max(0, moveEvent.clientY - startY);
			setWindows((prev) =>
				prev.map((w) => (w.id === id ? { ...w, x: newX, y: newY } : w))
			);
		};

		const onMouseUp = () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
	};

	const filteredApps = localizedApps.filter((app) => {
		const matchesQuery =
			app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			app.description.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesCategory =
			activeCategory === "all" || app.category === activeCategory;
		return matchesQuery && matchesCategory;
	});

	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				height: "calc(100vh - 58px)",
				background: "linear-gradient(135deg, #090a14 0%, #111428 50%, #0d1222 100%)",
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
				userSelect: "none",
			}}
		>
			{/* Desktop Work Area with Wallpaper Pattern */}
			<div
				style={{
					flex: 1,
					position: "relative",
					padding: "1.5rem",
					overflow: "hidden",
					backgroundImage:
						"radial-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px)",
					backgroundSize: "28px 28px",
				}}
				onClick={() => {
					if (isStartMenuOpen) setIsStartMenuOpen(false);
				}}
			>
				{/* Desktop App Icons */}
				<div
					style={{
						display: "grid",
						gridAutoFlow: "column",
						gridTemplateRows: "repeat(auto-fill, minmax(90px, 1fr))",
						gap: "1.25rem",
						width: "fit-content",
					}}
				>
					{localizedApps.map((app) => (
						<button
							key={app.id}
							type="button"
							onDoubleClick={() => launchApp(app.id)}
							onClick={(e) => {
								e.stopPropagation();
							}}
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								justifyContent: "center",
								gap: "0.4rem",
								width: "84px",
								padding: "0.6rem 0.4rem",
								background: "transparent",
								border: "1px solid transparent",
								borderRadius: "8px",
								color: "#f8fafc",
								cursor: "pointer",
								transition: "all 0.15s ease",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
								e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
								e.currentTarget.style.borderColor = "transparent";
							}}
							title={`Double click to open ${app.name}`}
						>
							<div
								style={{
									width: "44px",
									height: "44px",
									borderRadius: "10px",
									background: "rgba(15, 23, 42, 0.75)",
									border: "1px solid rgba(255, 255, 255, 0.1)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
								}}
							>
								{app.icon}
							</div>
							<span
								style={{
									fontSize: "11px",
									textAlign: "center",
									textShadow: "0 1px 3px rgba(0, 0, 0, 0.8)",
									maxWidth: "76px",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{app.name}
							</span>
						</button>
					))}
				</div>

				{/* Active Windows */}
				{windows.map((win) => {
					const isActive = win.id === activeWindowId;
					return (
						<div
							key={win.id}
							onMouseDown={() => focusWindow(win.id)}
							style={{
								position: "absolute",
								left: win.x,
								top: win.y,
								width: win.width,
								height: win.height,
								zIndex: win.zIndex,
								background: "rgba(18, 20, 36, 0.96)",
								backdropFilter: "blur(20px)",
								WebkitBackdropFilter: "blur(20px)",
								borderRadius: "10px",
								border: isActive
									? "1px solid rgba(56, 189, 248, 0.4)"
									: "1px solid rgba(255, 255, 255, 0.1)",
								boxShadow: isActive
									? "0 16px 40px rgba(0, 0, 0, 0.7), 0 0 15px rgba(56, 189, 248, 0.2)"
									: "0 12px 32px rgba(0, 0, 0, 0.5)",
								display: "flex",
								flexDirection: "column",
								overflow: "hidden",
							}}
						>
							{/* Window Header */}
							<div
								onMouseDown={(e) => startDrag(e, win.id)}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "0.5rem 0.85rem",
									background: isActive
										? "rgba(22, 26, 48, 0.95)"
										: "rgba(15, 17, 30, 0.95)",
									borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
									cursor: "move",
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "0.5rem",
										fontSize: "12px",
										fontWeight: 600,
										color: isActive ? "#f8fafc" : "#94a3b8",
									}}
								>
									{win.icon}
									<span>{win.title}</span>
								</div>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										closeWindow(win.id);
									}}
									style={{
										background: "transparent",
										border: "none",
										color: "#94a3b8",
										cursor: "pointer",
										padding: "2px 6px",
										borderRadius: "4px",
										fontSize: "14px",
										lineHeight: 1,
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#ef4444";
										e.currentTarget.style.color = "#fff";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
										e.currentTarget.style.color = "#94a3b8";
									}}
								>
									✕
								</button>
							</div>

							{/* Window Content */}
							<div
								style={{
									flex: 1,
									overflow: "auto",
									background: "#0f111e",
								}}
							>
								{win.content}
							</div>
						</div>
					);
				})}
			</div>

			{/* DaedalOS Start Menu Popup */}
			{isStartMenuOpen && (
				<div
					onClick={(e) => e.stopPropagation()}
					style={{
						position: "absolute",
						bottom: "48px",
						left: "10px",
						width: "500px",
						maxWidth: "calc(100vw - 20px)",
						height: "520px",
						maxHeight: "calc(100vh - 65px)",
						background: "rgba(16, 18, 32, 0.97)",
						backdropFilter: "blur(24px)",
						WebkitBackdropFilter: "blur(24px)",
						border: "1px solid rgba(255, 255, 255, 0.12)",
						borderRadius: "14px",
						boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.1)",
						zIndex: 9999,
						display: "flex",
						flexDirection: "column",
						overflow: "hidden",
					}}
				>
					{/* Search Header */}
					<div style={{ padding: "1rem 1rem 0.5rem" }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "0.5rem",
								background: "rgba(0, 0, 0, 0.4)",
								border: "1px solid rgba(255, 255, 255, 0.12)",
								borderRadius: "8px",
								padding: "0.5rem 0.75rem",
							}}
						>
							<Search size={15} color="#94a3b8" />
							<input
								type="text"
								placeholder={menuI18n.desktop?.searchPlaceholder || "Search DaedalOS apps, tools, settings..."}
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								style={{
									flex: 1,
									background: "transparent",
									border: "none",
									outline: "none",
									color: "#f8fafc",
									fontSize: "12px",
								}}
								autoFocus
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									style={{
										background: "transparent",
										border: "none",
										color: "#94a3b8",
										cursor: "pointer",
									}}
								>
									<X size={13} />
								</button>
							)}
						</div>
					</div>

					{/* Category Tabs */}
					<div
						style={{
							display: "flex",
							gap: "0.4rem",
							padding: "0.2rem 1rem 0.5rem",
							borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
						}}
					>
						{["all", "AI & Agents", "System", "Productivity"].map((cat) => {
							const catLabel =
								cat === "all"
									? menuI18n.desktop?.allApps || "All Apps"
									: menuI18n.desktop?.categories[cat] || cat;
							return (
								<button
									key={cat}
									type="button"
									onClick={() => setActiveCategory(cat)}
									style={{
										background:
											activeCategory === cat ? "rgba(56, 189, 248, 0.18)" : "transparent",
										color: activeCategory === cat ? "#38bdf8" : "#94a3b8",
										border: "none",
										fontSize: "11px",
										fontWeight: activeCategory === cat ? 600 : 400,
										padding: "0.25rem 0.6rem",
										borderRadius: "6px",
										cursor: "pointer",
									}}
								>
									{catLabel}
								</button>
							);
						})}
					</div>

					{/* App Grid */}
					<div
						style={{
							flex: 1,
							overflowY: "auto",
							padding: "0.75rem 1rem",
							display: "flex",
							flexDirection: "column",
							gap: "0.75rem",
						}}
					>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(2, 1fr)",
								gap: "0.5rem",
							}}
						>
							{filteredApps.map((app) => (
								<button
									key={app.id}
									type="button"
									onClick={() => launchApp(app.id)}
									style={{
										display: "flex",
										alignItems: "center",
										gap: "0.6rem",
										padding: "0.5rem 0.65rem",
										background: "rgba(255, 255, 255, 0.03)",
										border: "1px solid rgba(255, 255, 255, 0.06)",
										borderRadius: "8px",
										cursor: "pointer",
										textAlign: "left",
										color: "#f8fafc",
										transition: "all 0.15s ease",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
										e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
										e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
									}}
								>
									<div
										style={{
											width: "32px",
											height: "32px",
											borderRadius: "6px",
											background: "rgba(0, 0, 0, 0.4)",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
										}}
									>
										{app.icon}
									</div>
									<div style={{ overflow: "hidden" }}>
										<div
											style={{
												fontSize: "12px",
												fontWeight: 600,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{app.name}
										</div>
										<div
											style={{
												fontSize: "10px",
												color: "#94a3b8",
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{app.description}
										</div>
									</div>
								</button>
							))}
						</div>

						{/* Quick Action Highlight */}
						<div
							style={{
								background: "rgba(0, 0, 0, 0.25)",
								border: "1px solid rgba(255, 255, 255, 0.06)",
								borderRadius: "8px",
								padding: "0.6rem",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "0.4rem",
									fontSize: "11px",
									fontWeight: 600,
									color: "#cbd5e1",
									marginBottom: "0.4rem",
								}}
							>
								<Sparkles size={13} color="#f59e0b" />
								<span>{menuI18n.desktop?.quickLaunch || "DaedalOS Quick Launch"}</span>
							</div>
							<div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
								<button
									type="button"
									onClick={() => launchApp("chat")}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "0.3rem",
										background: "rgba(255, 255, 255, 0.06)",
										border: "1px solid rgba(255, 255, 255, 0.08)",
										color: "#e2e8f0",
										fontSize: "10px",
										padding: "0.25rem 0.5rem",
										borderRadius: "16px",
										cursor: "pointer",
									}}
								>
									<Bot size={12} /> {menuI18n.desktop?.apps["chat"]?.name || "AI Chat"}
								</button>
								<button
									type="button"
									onClick={() => launchApp("terminal")}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "0.3rem",
										background: "rgba(255, 255, 255, 0.06)",
										border: "1px solid rgba(255, 255, 255, 0.08)",
										color: "#e2e8f0",
										fontSize: "10px",
										padding: "0.25rem 0.5rem",
										borderRadius: "16px",
										cursor: "pointer",
									}}
								>
									<Terminal size={12} /> {menuI18n.desktop?.apps["terminal"]?.name || "Shell"}
								</button>
								<button
									type="button"
									onClick={() => launchApp("engine")}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "0.3rem",
										background: "rgba(255, 255, 255, 0.06)",
										border: "1px solid rgba(255, 255, 255, 0.08)",
										color: "#e2e8f0",
										fontSize: "10px",
										padding: "0.25rem 0.5rem",
										borderRadius: "16px",
										cursor: "pointer",
									}}
								>
									<Cpu size={12} /> {menuI18n.desktop?.apps["engine"]?.name || "AI Engine"}
								</button>
								<button
									type="button"
									onClick={() => launchApp("bitterbot")}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "0.3rem",
										background: "rgba(255, 255, 255, 0.06)",
										border: "1px solid rgba(255, 255, 255, 0.08)",
										color: "#e2e8f0",
										fontSize: "10px",
										padding: "0.25rem 0.5rem",
										borderRadius: "16px",
										cursor: "pointer",
									}}
								>
									<Package size={12} /> {menuI18n.desktop?.apps["bitterbot"]?.name || "Bitterbot"}
								</button>
							</div>
						</div>
					</div>

					{/* Start Menu Footer */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: "0.6rem 1rem",
							background: "rgba(10, 10, 20, 0.7)",
							borderTop: "1px solid rgba(255, 255, 255, 0.08)",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
							<div
								style={{
									width: "24px",
									height: "24px",
									borderRadius: "50%",
									background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									color: "#fff",
								}}
							>
								<User size={13} />
							</div>
							<span style={{ fontSize: "11px", fontWeight: 500, color: "#e2e8f0" }}>
								{menuI18n.desktop?.operator || "MuhanAI Operator"}
							</span>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
							<button
								type="button"
								onClick={() => setIsStartMenuOpen(false)}
								style={{
									background: "transparent",
									border: "none",
									color: "#94a3b8",
									padding: "0.3rem",
									borderRadius: "4px",
									cursor: "pointer",
								}}
								title={menuI18n.desktop?.lock || "Lock"}
							>
								<Lock size={14} />
							</button>
							<button
								type="button"
								onClick={() => setWindows([])}
								style={{
									background: "transparent",
									border: "none",
									color: "#94a3b8",
									padding: "0.3rem",
									borderRadius: "4px",
									cursor: "pointer",
								}}
								title={menuI18n.desktop?.closeAll || "Close all windows"}
							>
								<RotateCcw size={14} />
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Taskbar */}
			<div
				style={{
					height: "44px",
					background: "rgba(15, 17, 30, 0.96)",
					backdropFilter: "blur(16px)",
					borderTop: "1px solid rgba(255, 255, 255, 0.1)",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "0 0.5rem",
					zIndex: 10000,
				}}
			>
				{/* Taskbar Left: Start Menu Button + Quick Launch */}
				<div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setIsStartMenuOpen((prev) => !prev);
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "0.4rem",
							padding: "0.35rem 0.7rem",
							borderRadius: "6px",
							background: isStartMenuOpen
								? "rgba(14, 165, 233, 0.25)"
								: "rgba(255, 255, 255, 0.06)",
							border: isStartMenuOpen
								? "1px solid rgba(56, 189, 248, 0.5)"
								: "1px solid rgba(255, 255, 255, 0.1)",
							color: isStartMenuOpen ? "#38bdf8" : "#f8fafc",
							fontSize: "12px",
							fontWeight: 600,
							cursor: "pointer",
							transition: "all 0.15s ease",
						}}
						title="DaedalOS Start Menu"
					>
						<Bot size={15} />
						<span>MuhanAI</span>
					</button>

					<div style={{ display: "flex", alignItems: "center", gap: "0.2rem", marginLeft: "0.4rem" }}>
						<button
							type="button"
							onClick={() => launchApp("chat")}
							style={{
								background: "rgba(255, 255, 255, 0.04)",
								border: "1px solid rgba(255, 255, 255, 0.08)",
								borderRadius: "4px",
								padding: "0.25rem",
								color: "#94a3b8",
								cursor: "pointer",
							}}
							title="AI Chat"
						>
							<Bot size={14} className="text-emerald-400" />
						</button>
						<button
							type="button"
							onClick={() => launchApp("files")}
							style={{
								background: "rgba(255, 255, 255, 0.04)",
								border: "1px solid rgba(255, 255, 255, 0.08)",
								borderRadius: "4px",
								padding: "0.25rem",
								color: "#94a3b8",
								cursor: "pointer",
							}}
							title="File Explorer"
						>
							<Folder size={14} className="text-yellow-400" />
						</button>
						<button
							type="button"
							onClick={() => launchApp("terminal")}
							style={{
								background: "rgba(255, 255, 255, 0.04)",
								border: "1px solid rgba(255, 255, 255, 0.08)",
								borderRadius: "4px",
								padding: "0.25rem",
								color: "#94a3b8",
								cursor: "pointer",
							}}
							title="Terminal"
						>
							<Terminal size={14} className="text-cyan-400" />
						</button>
					</div>
				</div>

				{/* Taskbar Center: Active Windows */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.3rem",
						overflowX: "auto",
						maxWidth: "50%",
					}}
				>
					{windows.map((win) => {
						const isCurrent = win.id === activeWindowId;
						return (
							<button
								key={win.id}
								type="button"
								onClick={() => focusWindow(win.id)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: "0.4rem",
									padding: "0.25rem 0.6rem",
									borderRadius: "5px",
									background: isCurrent
										? "rgba(14, 165, 233, 0.22)"
										: "rgba(255, 255, 255, 0.04)",
									border: isCurrent
										? "1px solid rgba(56, 189, 248, 0.4)"
										: "1px solid rgba(255, 255, 255, 0.08)",
									color: isCurrent ? "#38bdf8" : "#94a3b8",
									fontSize: "11px",
									cursor: "pointer",
									maxWidth: "140px",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{win.icon}
								<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
									{win.title}
								</span>
							</button>
						);
					})}
				</div>

				{/* Taskbar Right: System Tray */}
				<div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "0.35rem",
							fontSize: "11px",
							color: "#10b981",
						}}
					>
						<div
							style={{
								width: "6px",
								height: "6px",
								borderRadius: "50%",
								background: "#10b981",
								boxShadow: "0 0 6px #10b981",
							}}
						/>
						<span>DaedalOS Active</span>
					</div>
					<Wifi size={13} color="#94a3b8" />
					<Volume2 size={13} color="#94a3b8" />
					<Battery size={13} color="#94a3b8" />
					<span style={{ fontSize: "11px", color: "#cbd5e1" }}>
						{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
					</span>
				</div>
			</div>
		</div>
	);
};

// Render inner content of each app
function renderAppContent(appId: string): ReactNode {
	switch (appId) {
		case "chat":
			return (
				<div style={{ padding: "1.25rem", height: "100%", color: "#e2e8f0" }}>
					<h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "0.5rem" }}>
						MuhanAI Token-Free Chat
					</h3>
					<p style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "1rem" }}>
						Connected to decentralized peer mesh with zero API tokens required.
					</p>
					<div
						style={{
							background: "rgba(0, 0, 0, 0.3)",
							border: "1px solid rgba(255, 255, 255, 0.08)",
							borderRadius: "8px",
							padding: "1rem",
							fontSize: "12px",
						}}
					>
						<span style={{ color: "#10b981", fontWeight: 600 }}>Assistant: </span>
						Hello! I am your autonomous AI companion running on the DaedalOS Web Desktop. How can I assist you today?
					</div>
				</div>
			);
		case "files":
			return (
				<div style={{ padding: "1rem", color: "#e2e8f0", fontSize: "12px" }}>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
						{[
							{ name: "Documents", size: "4 items", type: "folder" },
							{ name: "Knowledge-Base", size: "18 docs", type: "folder" },
							{ name: "Models", size: "3 weights", type: "folder" },
							{ name: "mesh-node.json", size: "1.2 KB", type: "file" },
							{ name: "credentials.vault", size: "512 B", type: "file" },
							{ name: "agent.config.yaml", size: "2.8 KB", type: "file" },
						].map((f) => (
							<div
								key={f.name}
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									padding: "0.75rem",
									borderRadius: "8px",
									background: "rgba(255, 255, 255, 0.03)",
									border: "1px solid rgba(255, 255, 255, 0.06)",
									textAlign: "center",
								}}
							>
								{f.type === "folder" ? (
									<Folder size={28} color="#f59e0b" />
								) : (
									<FileText size={28} color="#38bdf8" />
								)}
								<span style={{ marginTop: "0.4rem", fontWeight: 500, fontSize: "11px" }}>
									{f.name}
								</span>
								<span style={{ fontSize: "10px", color: "#64748b" }}>{f.size}</span>
							</div>
						))}
					</div>
				</div>
			);
		case "terminal":
			return (
				<div
					style={{
						padding: "1rem",
						fontFamily: "monospace",
						fontSize: "11px",
						color: "#10b981",
						height: "100%",
						background: "#080910",
					}}
				>
					<div style={{ color: "#64748b", marginBottom: "0.5rem" }}>
						MuhanAI DaedalOS Shell v1.0.0 (x86_64-darwin)
					</div>
					<div>
						<span style={{ color: "#38bdf8" }}>operator@muhanai</span>:
						<span style={{ color: "#a855f7" }}>~</span>$ neofetch
					</div>
					<pre style={{ marginTop: "0.25rem", color: "#10b981", fontSize: "11px" }}>
{`  __  __       _                  OS: DaedalOS Web
 |  \\/  |_   _| |__   __ _ _ __   Kernel: 6.12.0-agentmesh
 | |\\/| | | | | '_ \\ / _\` | '_ \\  Host: Browser Sandbox (WebGPU)
 | |  | | |_| | | | | (_| | | | | Memory: 2.3 GB / 8.0 GB
 |_|  |_|\\__,_|_| |_|\\__,_|_| |_| Uptime: 48 mins`}
					</pre>
					<div style={{ marginTop: "0.75rem" }}>
						<span style={{ color: "#38bdf8" }}>operator@muhanai</span>:
						<span style={{ color: "#a855f7" }}>~</span>$ <span className="animate-pulse">_</span>
					</div>
				</div>
			);
		case "browser":
			return (
				<div style={{ display: "flex", flexDirection: "column", height: "100%", color: "#e2e8f0" }}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "0.4rem",
							padding: "0.4rem 0.6rem",
							background: "rgba(10, 10, 20, 0.5)",
							borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
						}}
					>
						<button type="button" style={{ background: "transparent", border: "none", color: "#94a3b8" }}>
							<ArrowLeft size={13} />
						</button>
						<button type="button" style={{ background: "transparent", border: "none", color: "#94a3b8" }}>
							<ArrowRight size={13} />
						</button>
						<button type="button" style={{ background: "transparent", border: "none", color: "#94a3b8" }}>
							<RefreshCw size={13} />
						</button>
						<input
							type="text"
							readOnly
							value="https://find.muhanai.com"
							style={{
								flex: 1,
								background: "rgba(0, 0, 0, 0.4)",
								border: "1px solid rgba(255, 255, 255, 0.1)",
								borderRadius: "4px",
								padding: "0.2rem 0.5rem",
								color: "#38bdf8",
								fontSize: "11px",
								fontFamily: "monospace",
								outline: "none",
							}}
						/>
					</div>
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							padding: "2rem",
							textAlign: "center",
						}}
					>
						<Globe size={40} color="#38bdf8" style={{ marginBottom: "0.75rem" }} />
						<div style={{ fontSize: "14px", fontWeight: 600 }}>Cosmic Knowledge Web View</div>
						<p style={{ fontSize: "11px", color: "#94a3b8", maxWidth: "300px", marginTop: "0.25rem" }}>
							P2P decentralized browse tunnel active across the MuhanAI mesh network.
						</p>
					</div>
				</div>
			);
		case "engine":
			return (
				<div style={{ padding: "1rem", color: "#e2e8f0", fontSize: "11px" }}>
					<div
						style={{
							padding: "0.75rem",
							borderRadius: "8px",
							background: "rgba(255, 255, 255, 0.03)",
							border: "1px solid rgba(255, 255, 255, 0.08)",
							marginBottom: "0.75rem",
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
						}}
					>
						<div>
							<div style={{ fontWeight: 600, fontSize: "12px" }}>WebGPU Inference Acceleration</div>
							<div style={{ color: "#94a3b8", fontSize: "10px" }}>llama-3-8b-q4 on local device</div>
						</div>
						<span
							style={{
								padding: "0.2rem 0.5rem",
								borderRadius: "12px",
								background: "rgba(16, 185, 129, 0.2)",
								color: "#10b981",
								fontWeight: 600,
								fontSize: "10px",
							}}
						>
							READY
						</span>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
						<div style={{ padding: "0.5rem", background: "rgba(0,0,0,0.3)", borderRadius: "6px" }}>
							<div style={{ color: "#94a3b8", fontSize: "10px" }}>Active Backend</div>
							<div style={{ fontWeight: 600, color: "#38bdf8" }}>WebGPU (Metal/Vulkan)</div>
						</div>
						<div style={{ padding: "0.5rem", background: "rgba(0,0,0,0.3)", borderRadius: "6px" }}>
							<div style={{ color: "#94a3b8", fontSize: "10px" }}>Context Window</div>
							<div style={{ fontWeight: 600, color: "#f59e0b" }}>2048 Tokens</div>
						</div>
					</div>
			</div>
			);

		case "bitterbot":
		return (
			<div style={{ display: "flex", flexDirection: "column", height: "100%", color: "#e2e8f0", fontSize: "11px" }}>
				<div
					style={{
						padding: "0.5rem 0.75rem",
						background: "rgba(245, 158, 11, 0.1)",
						borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
						display: "flex",
						alignItems: "center",
						gap: "0.5rem",
					}}
				>
					<Package size={14} className="text-amber-400" />
					<span style={{ fontWeight: 600, fontSize: "12px" }}>Bitterbot Agent</span>
					<span
						style={{
							padding: "0.15rem 0.4rem",
							borderRadius: "10px",
							background: "rgba(245, 158, 11, 0.2)",
							color: "#f59e0b",
							fontSize: "9px",
							fontWeight: 600,
						}}
					>
						TOKEN-FREE
					</span>
				</div>
				<div style={{ flex: 1, padding: "1rem", overflow: "auto" }}>
					<div style={{ marginBottom: "1rem" }}>
						<div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>P2P Autonomous Agent</div>
						<div style={{ color: "#94a3b8", fontSize: "10px", lineHeight: 1.6 }}>
							Bitterbot은 토큰 프리 P2P 메쉬에서 동작하는 자율 에이전트입니다.<br />
							로컬 또는 P2P 모드로 작업 실행, 지식 검색, 협업 태스크 처리를 수행합니다.
						</div>
					</div>
					<div style={{ display: "flex", gap: "0.5rem" }}>
						<button
							style={{
								padding: "0.4rem 0.7rem",
								background: "rgba(245, 158, 11, 0.15)",
								border: "1px solid rgba(245, 158, 11, 0.3)",
								borderRadius: "6px",
								color: "#f59e0b",
								fontSize: "10px",
								cursor: "pointer",
							}}
						>
							새 작업 실행
						</button>
						<button
							style={{
								padding: "0.4rem 0.7rem",
								background: "rgba(56, 189, 248, 0.1)",
								border: "1px solid rgba(56, 189, 248, 0.2)",
								borderRadius: "6px",
								color: "#38bdf8",
								fontSize: "10px",
								cursor: "pointer",
							}}
						>
							P2P 상태 확인
						</button>
					</div>
				</div>
			</div>
		);
		case "editor":
			return (
				<div style={{ display: "flex", flexDirection: "column", height: "100%", color: "#e2e8f0" }}>
					<div
						style={{
							padding: "0.4rem 0.6rem",
							background: "rgba(10, 10, 20, 0.6)",
							borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
							fontSize: "11px",
							color: "#94a3b8",
						}}
					>
						agent-mesh-entry.ts
					</div>
					<textarea
						readOnly
						value={`// MuhanAI Token-Free Autonomous Agent Node
import { MuhanMesh } from "@agentmesh/mesh";

export async function run() {
  const mesh = new MuhanMesh();
  console.log("Connected to DaedalOS local runtime!");
}`}
						style={{
							flex: 1,
							background: "#080910",
							border: "none",
							color: "#10b981",
							fontFamily: "monospace",
							fontSize: "11px",
							padding: "0.75rem",
							outline: "none",
							resize: "none",
						}}
					/>
				</div>
			);
		case "settings":
			return (
				<div style={{ padding: "1rem", color: "#e2e8f0", fontSize: "11px" }}>
					<div style={{ fontWeight: 600, fontSize: "12px", marginBottom: "0.5rem" }}>
						DaedalOS Desktop Preferences
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
						<label
							style={{
								display: "flex",
								justifyContent: "space-between",
								padding: "0.5rem",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.03)",
								border: "1px solid rgba(255, 255, 255, 0.06)",
							}}
						>
							<span>P2P Peer Discovery</span>
							<span style={{ color: "#10b981" }}>Enabled</span>
						</label>
						<label
							style={{
								display: "flex",
								justifyContent: "space-between",
								padding: "0.5rem",
								borderRadius: "6px",
								background: "rgba(255, 255, 255, 0.03)",
								border: "1px solid rgba(255, 255, 255, 0.06)",
							}}
						>
							<span>Cosmic Glass Transparency</span>
							<span style={{ color: "#10b981" }}>Active</span>
						</label>
					</div>
				</div>
			);
		default:
			return <div style={{ padding: "1rem", color: "#94a3b8" }}>Application content</div>;
	}
}
