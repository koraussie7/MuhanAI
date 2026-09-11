"use client";

import { useState, ReactNode } from "react";
import { Window } from "./Window";
import { Bot, Folder, Terminal, Globe } from "lucide-react";

interface DesktopProps {
	children?: ReactNode;
}

const DESKTOP_APPS = [
	{ id: "chat", name: "MuhanAI Chat", icon: <Globe size={24} />, component: null },
	{ id: "files", name: "File Explorer", icon: <Folder size={24} />, component: null },
	{ id: "terminal", name: "Terminal", icon: <Terminal size={24} />, component: null },
];

export function Desktop({ children }: DesktopProps) {
	const [windows, setWindows] = useState<
		Array<{ id: string; title: string; icon: ReactNode; content: ReactNode }>
	>([]);

	const openWindow = (
		id: string,
		title: string,
		icon: ReactNode,
		content: ReactNode
	) => {
		if (windows.find((w) => w.id === id)) return;
		setWindows((prev) => [...prev, { id, title, icon, content }]);
	};

	const closeWindow = (id: string) => {
		setWindows((prev) => prev.filter((w) => w.id !== id));
	};

	return (
		<div className="desktop">
			<div className="desktop-icons">
				<button
					className="desktop-icon"
					onDoubleClick={() =>
						openWindow(
							"chat",
							"AI Chat",
							<Globe size={32} />,
							children || <div>Chat Widget</div>
						)
					}
				>
					<span className="icon">
						<Globe size={32} />
					</span>
					<span className="label">AI Chat</span>
				</button>

				{DESKTOP_APPS.filter((app) => app.id !== "chat").map((app) => (
					<button
						key={app.id}
						className="desktop-icon"
						onDoubleClick={() =>
							openWindow(
								app.id,
								app.name,
								app.icon,
								<div className="p-4">{app.name} - Coming Soon</div>
							)
						}
					>
						<span className="icon">{app.icon}</span>
						<span className="label">{app.name}</span>
					</button>
				))}
			</div>

			<div className="windows">
				{windows.map((window) => (
					<Window
						key={window.id}
						id={window.id}
						title={window.title}
						icon={window.icon}
						defaultPosition={{
							x: 200 + windows.indexOf(window) * 30,
							y: 150 + windows.indexOf(window) * 30,
						}}
						onClose={() => closeWindow(window.id)}
					>
						{window.content}
					</Window>
				))}
			</div>
		</div>
	);
}

