"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Desktop, type WindowData } from "@/components/Desktop";
import { Taskbar } from "@/components/Taskbar";
import { StartMenu } from "@/components/StartMenu";
import {
	FileExplorerApp,
	TerminalApp,
	BrowserApp,
	EngineMonitorApp,
	CodeStudioApp,
	SettingsApp,
} from "@/components/DesktopApps";
import { ChatWidget } from "@agentmesh/ai-ui";
import { AIEngineFactory } from "@agentmesh/ai-engine/factory";
import type { EngineConfig } from "@agentmesh/ai-engine/types";
import { useI18n } from "@agentmesh/web/i18n.js";
import { Bot, Folder, Terminal, Globe, Cpu, Code, Settings } from "lucide-react";

export default function Home() {
	const { lang } = useI18n();
	const [isLoading, setIsLoading] = useState(true);
	const [engineStatus, setEngineStatus] = useState<"initializing" | "ready" | "loading" | "error">("initializing");

	useEffect(() => {
		document.documentElement.lang = lang;
	}, [lang]);

	// Window & Start Menu state
	const [windows, setWindows] = useState<WindowData[]>([]);
	const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
	const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
	const [topZIndex, setTopZIndex] = useState(100);

	const initEngine = useCallback(async () => {
		try {
			setEngineStatus("initializing");

			// Check WebGPU support
			const hasWebGPU = "gpu" in navigator;

			const config: EngineConfig = {
				type: "sipp",
				backend: hasWebGPU ? "webgpu" : "wasm",
				model: "llama-3-8b-q4",
				maxTokens: 2048,
				temperature: 0.7,
			};

			const engine = AIEngineFactory.create(config);

			engine.on("status", (status) => {
				if (status.ready) {
					setEngineStatus("ready");
				} else if (status.loading) {
					setEngineStatus("loading");
				} else if (status.error) {
					setEngineStatus("error");
				}
			});

			await engine.init();
			setIsLoading(false);
		} catch (error) {
			console.error("Engine init failed:", error);
			setEngineStatus("error");
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		initEngine();
	}, [initEngine]);

	// Open or bring window to front
	const handleLaunchApp = (appId: string) => {
		const existing = windows.find((w) => w.id === appId);
		const nextZ = topZIndex + 1;
		setTopZIndex(nextZ);
		setActiveWindowId(appId);

		if (existing) {
			setWindows((prev) =>
				prev.map((w) => (w.id === appId ? { ...w, zIndex: nextZ } : w))
			);
			return;
		}

		let title = "Application";
		let icon: ReactNode = <Bot size={18} />;
		let content: ReactNode = <div>App Content</div>;

		switch (appId) {
			case "chat":
				title = "MuhanAI Chat";
				icon = <Bot size={18} className="text-emerald-400" />;
				content = <ChatWidget />;
				break;
			case "files":
				title = "File Explorer";
				icon = <Folder size={18} className="text-yellow-400" />;
				content = <FileExplorerApp />;
				break;
			case "terminal":
				title = "Terminal";
				icon = <Terminal size={18} className="text-cyan-400" />;
				content = <TerminalApp />;
				break;
			case "browser":
				title = "Web Browser";
				icon = <Globe size={18} className="text-blue-400" />;
				content = <BrowserApp />;
				break;
			case "engine":
				title = "AI Engine Monitor";
				icon = <Cpu size={18} className="text-purple-400" />;
				content = <EngineMonitorApp engineStatus={engineStatus} />;
				break;
			case "editor":
				title = "Code Studio";
				icon = <Code size={18} className="text-pink-400" />;
				content = <CodeStudioApp />;
				break;
			case "settings":
				title = "System Settings";
				icon = <Settings size={18} className="text-gray-400" />;
				content = <SettingsApp />;
				break;
			default:
				title = appId;
				content = <div className="p-4 text-gray-300">App {appId} opened.</div>;
		}

		setWindows((prev) => [
			...prev,
			{ id: appId, title, icon, content, zIndex: nextZ },
		]);
	};

	const handleOpenWindow = (
		id: string,
		title: string,
		icon: ReactNode,
		content: ReactNode
	) => {
		const nextZ = topZIndex + 1;
		setTopZIndex(nextZ);
		setActiveWindowId(id);

		if (windows.find((w) => w.id === id)) {
			setWindows((prev) =>
				prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
			);
			return;
		}

		setWindows((prev) => [...prev, { id, title, icon, content, zIndex: nextZ }]);
	};

	const handleCloseWindow = (id: string) => {
		setWindows((prev) => prev.filter((w) => w.id !== id));
		if (activeWindowId === id) {
			setActiveWindowId(null);
		}
	};

	const handleFocusWindow = (id: string) => {
		const nextZ = topZIndex + 1;
		setTopZIndex(nextZ);
		setActiveWindowId(id);
		setWindows((prev) =>
			prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
		);
	};

	if (isLoading) {
		return (
			<div className="loading-screen">
				<div className="loading-content">
					<h1>MuhanAI Desktop</h1>
					<div className="status">{engineStatus}</div>
					<div className="spinner" />
				</div>
			</div>
		);
	}

	return (
		<div className="desktop-container">
			<Desktop
				windows={windows}
				activeWindowId={activeWindowId}
				onOpenWindow={handleOpenWindow}
				onCloseWindow={handleCloseWindow}
				onFocusWindow={handleFocusWindow}
			>
				<ChatWidget />
			</Desktop>

			{/* DaedalOS Start Menu Popup */}
			<StartMenu
				isOpen={isStartMenuOpen}
				onClose={() => setIsStartMenuOpen(false)}
				onLaunchApp={handleLaunchApp}
			/>

			{/* Taskbar with Start Menu Button & Task Items */}
			<Taskbar
				engineStatus={engineStatus}
				isStartMenuOpen={isStartMenuOpen}
				onToggleStartMenu={() => setIsStartMenuOpen((prev) => !prev)}
				activeWindows={windows.map((w) => ({
					id: w.id,
					title: w.title,
					icon: w.icon,
					isActive: w.id === activeWindowId,
				}))}
				activeWindowId={activeWindowId}
				onFocusWindow={handleFocusWindow}
				onQuickLaunch={handleLaunchApp}
			/>
		</div>
	);
}
