"use client";

import { useState, type ReactNode } from "react";
import { Window } from "./Window";
import {
	Bot,
	Folder,
	Terminal,
	Globe,
	Cpu,
	Settings,
	Code,
	Package,
} from "lucide-react";

export interface WindowData {
	id: string;
	title: string;
	icon: ReactNode;
	content: ReactNode;
	zIndex?: number;
}

interface DesktopProps {
	children?: ReactNode;
	windows?: WindowData[];
	activeWindowId?: string | null;
	onOpenWindow?: (
		id: string,
		title: string,
		icon: ReactNode,
		content: ReactNode
	) => void;
	onCloseWindow?: (id: string) => void;
	onFocusWindow?: (id: string) => void;
}

export const DESKTOP_APPS = [
	{ id: "chat", name: "AI Chat", icon: <Bot size={28} className="text-emerald-400" /> },
	{ id: "files", name: "File Explorer", icon: <Folder size={28} className="text-yellow-400" /> },
	{ id: "terminal", name: "Terminal", icon: <Terminal size={28} className="text-cyan-400" /> },
	{ id: "browser", name: "Browser", icon: <Globe size={28} className="text-blue-400" /> },
	{ id: "engine", name: "AI Engine", icon: <Cpu size={28} className="text-purple-400" /> },
	{ id: "editor", name: "Code Studio", icon: <Code size={28} className="text-pink-400" /> },
	{ id: "bitterbot", name: "Bitterbot", icon: <Package size={28} className="text-amber-400" /> },
	{ id: "settings", name: "Settings", icon: <Settings size={28} className="text-gray-400" /> },
];

export function Desktop({
	children,
	windows: controlledWindows,
	activeWindowId,
	onOpenWindow,
	onCloseWindow,
	onFocusWindow,
}: DesktopProps) {
	const [internalWindows, setInternalWindows] = useState<WindowData[]>([]);

	const isControlled = controlledWindows !== undefined;
	const currentWindows = isControlled ? controlledWindows : internalWindows;

	const handleOpen = (
		id: string,
		title: string,
		icon: ReactNode,
		content: ReactNode
	) => {
		if (onOpenWindow) {
			onOpenWindow(id, title, icon, content);
			return;
		}
		if (internalWindows.find((w) => w.id === id)) return;
		setInternalWindows((prev) => [...prev, { id, title, icon, content, zIndex: 100 + prev.length }]);
	};

	const handleClose = (id: string) => {
		if (onCloseWindow) {
			onCloseWindow(id);
			return;
		}
		setInternalWindows((prev) => prev.filter((w) => w.id !== id));
	};

	const handleFocus = (id: string) => {
		if (onFocusWindow) {
			onFocusWindow(id);
		}
	};

	return (
		<div className="desktop">
			<div className="desktop-icons">
				<button
					type="button"
					className="desktop-icon"
					onDoubleClick={() =>
						handleOpen(
							"chat",
							"AI Chat",
							<Bot size={20} className="text-emerald-400" />,
							children || <div>Chat Widget</div>
						)
					}
				>
					<span className="icon">
						<Bot size={32} className="text-emerald-400" />
					</span>
					<span className="label">AI Chat</span>
				</button>

				{DESKTOP_APPS.filter((app) => app.id !== "chat").map((app) => (
					<button
						key={app.id}
						type="button"
						className="desktop-icon"
						onDoubleClick={() =>
							handleOpen(
								app.id,
								app.name,
								app.icon,
								<div className="p-4 text-gray-200">
									<h3 className="text-lg font-semibold mb-2">{app.name}</h3>
									<p className="text-sm text-gray-400">
										DaedalOS {app.name} is running in local sandbox.
									</p>
								</div>
							)
						}
					>
						<span className="icon">{app.icon}</span>
						<span className="label">{app.name}</span>
					</button>
				))}
			</div>

			<div className="windows">
				{currentWindows.map((window, index) => (
					<Window
						key={window.id}
						id={window.id}
						title={window.title}
						icon={window.icon}
						zIndex={window.zIndex ?? 100 + index}
						onFocus={() => handleFocus(window.id)}
						defaultPosition={{
							x: 180 + (index % 6) * 35,
							y: 80 + (index % 6) * 35,
						}}
						onClose={() => handleClose(window.id)}
					>
						{window.content}
					</Window>
				))}
			</div>
		</div>
	);
}

