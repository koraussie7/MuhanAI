"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Bot, Wifi, Battery, Volume2, Folder, Terminal } from "lucide-react";

export interface ActiveWindowItem {
	id: string;
	title: string;
	icon: ReactNode;
	isActive?: boolean;
}

export interface TaskbarProps {
	engineStatus?: "initializing" | "ready" | "loading" | "error";
	isStartMenuOpen?: boolean;
	onToggleStartMenu?: () => void;
	activeWindows?: ActiveWindowItem[];
	activeWindowId?: string | null;
	onFocusWindow?: (id: string) => void;
	onQuickLaunch?: (appId: string) => void;
}

export function Taskbar({
	engineStatus = "ready",
	isStartMenuOpen = false,
	onToggleStartMenu,
	activeWindows = [],
	activeWindowId,
	onFocusWindow,
	onQuickLaunch,
}: TaskbarProps) {
	const [time, setTime] = useState(new Date());
	const [memoryUsage, setMemoryUsage] = useState<{
		used: number;
		total: number;
	} | null>(null);

	useEffect(() => {
		const timer = setInterval(() => setTime(new Date()), 1000);

		// Simulate memory usage
		const memTimer = setInterval(() => {
			const nav = navigator as Navigator & { deviceMemory?: number };
			if (nav.deviceMemory) {
				setMemoryUsage({
					used: Math.floor(Math.random() * 4096) + 1024,
					total: nav.deviceMemory * 1024,
				});
			}
		}, 5000);

		return () => {
			clearInterval(timer);
			clearInterval(memTimer);
		};
	}, []);

	const getStatusColor = () => {
		switch (engineStatus) {
			case "ready":
				return "text-green-400";
			case "loading":
				return "text-yellow-400";
			case "error":
				return "text-red-400";
			default:
				return "text-gray-400";
		}
	};

	return (
		<div className="taskbar">
			<div className="taskbar-left">
				<button
					type="button"
					className={`start-button flex items-center gap-2 ${isStartMenuOpen ? "active" : ""}`}
					onClick={onToggleStartMenu}
					title="Start Menu (DaedalOS)"
				>
					<Bot size={16} />
					<span>MuhanAI</span>
				</button>

				{/* Engine status indicator */}
				<div className={`engine-status flex items-center gap-2 ${getStatusColor()}`}>
					<div className="w-2 h-2 rounded-full bg-current animate-pulse" />
					<span className="text-xs">
						{engineStatus === "ready" ? "AI Ready" :
						 engineStatus === "loading" ? "Loading..." :
						 engineStatus === "error" ? "AI Error" : "Initializing..."}
					</span>
				</div>

				{/* Quick launch apps */}
				<div className="quick-launch flex items-center gap-1 ml-4">
					<button
						type="button"
						className="quick-app-btn"
						title="AI Chat"
						onClick={() => onQuickLaunch?.("chat")}
					>
						<Bot size={14} />
					</button>
					<button
						type="button"
						className="quick-app-btn"
						title="File Explorer"
						onClick={() => onQuickLaunch?.("files")}
					>
						<Folder size={14} />
					</button>
					<button
						type="button"
						className="quick-app-btn"
						title="Terminal"
						onClick={() => onQuickLaunch?.("terminal")}
					>
						<Terminal size={14} />
					</button>
				</div>
			</div>

			<div className="taskbar-center">
				<div className="taskbar-items">
					{activeWindows.map((win) => {
						const isCurrent = win.id === activeWindowId;
						return (
							<button
								key={win.id}
								type="button"
								className={`taskbar-window-item ${isCurrent ? "active" : ""}`}
								onClick={() => onFocusWindow?.(win.id)}
								title={win.title}
							>
								<span className="taskbar-item-icon">{win.icon}</span>
								<span className="taskbar-item-title">{win.title}</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="taskbar-right flex items-center gap-3">
				<div className="system-tray flex items-center gap-3">
					{memoryUsage && (
						<span className="text-xs text-gray-400">
							{(memoryUsage.used / 1024).toFixed(1)}GB / {(memoryUsage.total / 1024).toFixed(0)}GB
						</span>
					)}
					<Wifi size={14} className="text-gray-400" />
					<Volume2 size={14} className="text-gray-400" />
					<Battery size={14} className="text-gray-400" />
					<span className="time text-xs text-gray-300">
						{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
					</span>
				</div>
			</div>
		</div>
	);
}

