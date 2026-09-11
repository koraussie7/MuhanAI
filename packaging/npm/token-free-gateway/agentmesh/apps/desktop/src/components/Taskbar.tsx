"use client";

import { useState, useEffect } from "react";
import { Bot, Wifi, Battery, Volume2 } from "lucide-react";

interface TaskbarProps {
	engineStatus: "initializing" | "ready" | "loading" | "error";
}

interface TaskbarProps {
	engineStatus: "initializing" | "ready" | "loading" | "error";
}

export function Taskbar({ engineStatus = "ready" }: TaskbarProps) {
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
				<button className="start-button flex items-center gap-2">
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
					<button className="quick-app-btn" title="Chat">
						<Bot size={14} />
					</button>
					<button className="quick-app-btn" title="Files">
						📁
					</button>
					<button className="quick-app-btn" title="Terminal">
						💻
					</button>
				</div>
			</div>

			<div className="taskbar-center">
				<div className="taskbar-items">
					{/* Active windows will be listed here */}
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

