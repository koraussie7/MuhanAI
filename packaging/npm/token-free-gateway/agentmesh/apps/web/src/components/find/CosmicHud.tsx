import {
	ChevronDown,
	ChevronUp,
	Globe,
	Layers,
	LayoutDashboard,
	Maximize2,
	Minimize2,
	Radio,
	Sliders,
	Sparkles,
	Terminal,
	Wifi,
	Zap,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { NodeType } from "./types";

interface CosmicHudProps {
	peersCount: number;
	notesCount: number;
	edgesCount: number;
	latencyMs: number;
	searchFilter: string;
	onSearchChange: (query: string) => void;
	onConnectSimulatedPeer: (nameInput?: string) => void;
	onConnectUserPeer: () => void;
	connectedPeerName: string;
	userPeerConnected: boolean;
	activeTypeFilters: Record<NodeType, boolean>;
	onToggleTypeFilter: (type: NodeType) => void;
	repelStrength: number;
	onRepelChange: (v: number) => void;
	linkDistance: number;
	onLinkDistChange: (v: number) => void;
	centerGravity: number;
	onGravityChange: (v: number) => void;
	eventsLog: string[];
	onNavigateHome: () => void;
}

export const CosmicHud: React.FC<CosmicHudProps> = ({
	peersCount,
	notesCount,
	edgesCount,
	latencyMs,
	searchFilter,
	onSearchChange,
	onConnectSimulatedPeer,
	onConnectUserPeer,
	userPeerConnected,
	activeTypeFilters,
	onToggleTypeFilter,
	repelStrength,
	onRepelChange,
	linkDistance,
	onLinkDistChange,
	centerGravity,
	onGravityChange,
	eventsLog,
	onNavigateHome,
}) => {
	const { lang, setLanguage, t, supportedLanguages } = useI18n();
	const [showSettings, setShowSettings] = useState(false);
	const [showLog, setShowLog] = useState(true);
	const [isFullscreen, setIsFullscreen] = useState(false);

	useEffect(() => {
		const onChange = () => setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", onChange);
		return () => document.removeEventListener("fullscreenchange", onChange);
	}, []);

	const toggleFullscreen = () => {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen().catch(() => {});
		}
	};

	return (
		<div className="cosmic-hud-container pointer-events-none">
			{/* Top Header Bar */}
			<header className="cosmic-top-bar pointer-events-auto">
				<div className="flex items-center gap-4">
					<button
						type="button"
						className="cosmic-back-btn"
						onClick={onNavigateHome}
						title="Open Developer Console & Knowledge IN Feed"
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							fontWeight: 600,
						}}
					>
						<LayoutDashboard size={14} className="text-sky-400" />
						<span>Developer Console</span>
					</button>

					<div className="flex items-center gap-2.5 pl-2 border-l border-white/10">
						<span className="cosmic-pulse-beacon" />
						<div>
							<div className="flex items-center gap-1.5">
								<span className="cosmic-brand-title font-mono font-bold tracking-wider text-sm">
									muhanai.com
								</span>
								<span className="cosmic-badge">COSMIC MESH</span>
							</div>
							<div className="text-[10px] text-slate-400 font-mono tracking-tight">
								Obsidian Graph Topology & P2P Silhouette
							</div>
						</div>
					</div>
				</div>

				{/* Center Live Telemetry */}
				<div className="hidden lg:flex items-center gap-5 px-4 py-1.5 rounded-full bg-slate-950/70 border border-white/10 backdrop-blur-md font-mono text-xs shadow-lg">
					<div className="flex items-center gap-1.5 text-slate-300">
						<Globe size={13} className="text-sky-400" />
						<span className="text-slate-400">Peers:</span>
						<span className="text-white font-bold">{peersCount.toLocaleString()}</span>
					</div>
					<span className="text-white/20">|</span>
					<div className="flex items-center gap-1.5 text-slate-300">
						<Layers size={13} className="text-emerald-400" />
						<span className="text-slate-400">Notes:</span>
						<span className="text-white font-bold">{notesCount}</span>
					</div>
					<span className="text-white/20">|</span>
					<div className="flex items-center gap-1.5 text-slate-300">
						<Radio size={13} className="text-purple-400" />
						<span className="text-slate-400">Synapses:</span>
						<span className="text-white font-bold">{edgesCount}</span>
					</div>
					<span className="text-white/20">|</span>
					<div className="flex items-center gap-1.5 text-slate-300">
						<Wifi size={13} className="text-amber-400" />
						<span className="text-slate-400">Latency:</span>
						<span className="text-emerald-400 font-bold">{latencyMs}ms</span>
					</div>
				</div>

				{/* Right Action Tools */}
				<div className="flex items-center gap-2.5">
					{/* Connect Peer Action Buttons */}
					<button
						type="button"
						className="cosmic-action-btn primary"
						onClick={() => onConnectSimulatedPeer()}
						title="Simulate a remote peer joining the network with shockwave & notes"
					>
						<Sparkles size={13} className="text-sky-300" />
						<span>Connect Peer</span>
					</button>

					<button
						type="button"
						className={`cosmic-action-btn ${userPeerConnected ? "active" : "secondary"}`}
						onClick={onConnectUserPeer}
						title="Mount your browser device into the P2P Obsidian network"
					>
						<Zap size={13} className={userPeerConnected ? "text-emerald-400" : "text-amber-400"} />
						<span>{userPeerConnected ? "My Peer Connected" : "Connect My Device"}</span>
					</button>

					{/* Physics Settings Button */}
					<button
						type="button"
						className={`cosmic-icon-btn ${showSettings ? "active" : ""}`}
						onClick={() => setShowSettings(!showSettings)}
						title="Graph Physics Parameters"
					>
						<Sliders size={14} />
					</button>

					{/* Fullscreen Button */}
					<button
						type="button"
						className="cosmic-icon-btn"
						onClick={toggleFullscreen}
						title="Toggle Fullscreen"
					>
						{isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
					</button>
				</div>
			</header>

			{/* Physics Settings Overlay Panel */}
			{showSettings && (
				<div className="cosmic-settings-panel pointer-events-auto">
					<div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10">
						<span className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
							<Sliders size={13} className="text-sky-400" />
							Obsidian Graph Forces
						</span>
						<button
							type="button"
							className="text-slate-400 hover:text-white text-xs"
							onClick={() => setShowSettings(false)}
						>
							✕
						</button>
					</div>

					{/* Sliders */}
					<div className="space-y-3 font-mono text-xs">
						<div>
							<div className="flex justify-between text-slate-300 mb-1">
								<span>Repel Force</span>
								<span className="text-sky-400">{repelStrength}x</span>
							</div>
							<input
								type="range"
								min="0.2"
								max="3.0"
								step="0.1"
								value={repelStrength}
								onChange={(e) => onRepelChange(parseFloat(e.target.value))}
								className="cosmic-slider"
							/>
						</div>

						<div>
							<div className="flex justify-between text-slate-300 mb-1">
								<span>Link Distance</span>
								<span className="text-emerald-400">{linkDistance}px</span>
							</div>
							<input
								type="range"
								min="50"
								max="260"
								step="10"
								value={linkDistance}
								onChange={(e) => onLinkDistChange(parseInt(e.target.value, 10))}
								className="cosmic-slider"
							/>
						</div>

						<div>
							<div className="flex justify-between text-slate-300 mb-1">
								<span>Center Gravity</span>
								<span className="text-purple-400">{centerGravity}x</span>
							</div>
							<input
								type="range"
								min="0.1"
								max="2.5"
								step="0.1"
								value={centerGravity}
								onChange={(e) => onGravityChange(parseFloat(e.target.value))}
								className="cosmic-slider"
							/>
						</div>
					</div>

					{/* Type Filters */}
					<div className="pt-3 mt-3 border-t border-white/10">
						<span className="text-[11px] font-mono text-slate-400 block mb-2">VISIBLE FILTERS</span>
						<div className="flex flex-wrap gap-1.5">
							{(["core", "agent", "note", "tag"] as const).map((t) => (
								<button
									key={t}
									type="button"
									className={`cosmic-type-chip ${activeTypeFilters[t] ? "active" : ""}`}
									onClick={() => onToggleTypeFilter(t)}
								>
									<span className={`type-dot ${t}`} />
									<span className="capitalize">{t}</span>
								</button>
							))}
						</div>
					</div>
				</div>
			)}

			{/* Bottom Live Ticker / Event Terminal */}
			<div className="cosmic-bottom-ticker pointer-events-auto">
				<div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-white/5">
					<div className="flex items-center gap-2">
						<Terminal size={12} className="text-emerald-400" />
						<span className="font-mono text-[11px] font-bold text-slate-300">
							P2P MESH EVENT FEED & WEBRTC CRDT LOG
						</span>
					</div>
					<button
						type="button"
						className="text-slate-400 hover:text-white"
						onClick={() => setShowLog(!showLog)}
					>
						{showLog ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
					</button>
				</div>

				{showLog && (
					<div className="p-2 space-y-1 max-h-24 overflow-y-auto font-mono text-[11px] text-slate-400">
						{eventsLog.slice(0, 4).map((evt, idx) => (
							<div key={idx} className="flex items-start gap-2 leading-relaxed">
								<span className="text-sky-400 shrink-0">❯</span>
								<span className="text-slate-200">{evt}</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
