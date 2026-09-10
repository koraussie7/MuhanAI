import { useEffect, useState } from "react";
import { useGossipPulse } from "../hooks/useGossipPulse.js";
import { formatPeerCountBare, formatHumanCount } from "../lib/mesh-stats.js";

const API = "";

interface PulseData {
	newQuestions: number;
	verifyRequests: number;
	humansNeeded: number;
	aiConflicts: number;
	knowledgeGaps: number;
	mcpTasksWaiting: number;
	agentsOnline?: number;
	humansOnline?: number;
}

const DEFAULT_PULSE: PulseData = {
	newQuestions: 14,
	verifyRequests: 8,
	humansNeeded: 5,
	aiConflicts: 3,
	knowledgeGaps: 6,
	mcpTasksWaiting: 12,
	agentsOnline: undefined,
	humansOnline: undefined,
};

/**
 * Map a PulseMessage.kind to one of our counters.
 * "pulse" is the default fan-out kind; we count it as "new questions".
 * "presence" updates online counts; "request" → verification; "reply" → answers.
 *
 * This is a heuristic that lets us render SOMETHING live even before
 * the server emits structured per-counter messages. Once the server
 * adds a typed aggregator, we replace this with a direct field read.
 */
function bucketForKind(kind: string): keyof PulseData | null {
	switch (kind) {
		case "pulse":
			return "newQuestions";
		case "request":
			return "verifyRequests";
		case "reply":
			return "mcpTasksWaiting";
		default:
			return null;
	}
}

type Props = {
	/**
	 * When true, subscribe to /api/pulse/stream and increment counters
	 * from inbound messages in addition to the periodic polling refresh.
	 * Default false — polling-only is the legacy behavior.
	 */
	live?: boolean;
};

export function NetworkPulse({ live = false }: Props) {
	const [pulse, setPulse] = useState<PulseData>(DEFAULT_PULSE);

	useEffect(() => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 4000);

		const loadPulse = async () => {
			try {
				const res = await fetch(`${API}/api/pulse`, {
					signal: controller.signal,
				});
				if (res.ok) {
					const data = await res.json();
					setPulse((prev) => ({ ...prev, ...data }));
				}
			} catch {
				// Fallback to defaults
			} finally {
				clearTimeout(timeout);
			}
		};

		loadPulse();
		const interval = setInterval(loadPulse, 10000);
		return () => {
			clearTimeout(timeout);
			clearInterval(interval);
			controller.abort();
		};
	}, []);

	// Live mode: increment counters from inbound SSE messages.
	// We deliberately do NOT replace `pulse` — the periodic poll keeps the
	// baseline honest. SSE just nudges counters upward on activity.
	const { latest } = useGossipPulse({
		url: "/api/pulse/stream",
		disabled: !live,
	});

	useEffect(() => {
		if (!latest) return;
		const bucket = bucketForKind(latest.kind);
		if (!bucket) return;
		setPulse((prev) => ({ ...prev, [bucket]: (prev[bucket] as number) + 1 }));
	}, [latest]);

	const items = [
		["new questions", pulse.newQuestions, "badge-cyan"],
		["verification requests", pulse.verifyRequests, "badge-amber"],
		["human experts needed", pulse.humansNeeded, "badge-rose"],
		["AI conflicts", pulse.aiConflicts, "badge-violet"],
		["knowledge gaps", pulse.knowledgeGaps, "badge-amber"],
		["MCP tasks waiting", pulse.mcpTasksWaiting, "badge-cyan"],
	] as const;

	return (
		<div className="network-pulse">
			<div className="pulse-header">
				<span className="pulse-dot" />
				<span className="pulse-title">NETWORK PULSE</span>
				<span className="pulse-subtitle">
					(agents online: {formatPeerCountBare(pulse.agentsOnline)} · human:{" "}
					{formatHumanCount(pulse.humansOnline)}){live ? " · LIVE" : ""}
				</span>
			</div>
			<div className="pulse-items">
				{items.map(([label, count, badgeClass]) => (
					<span key={label} className="pulse-item">
						<span className={`pulse-badge ${badgeClass}`}>{count}</span>
						<span className="pulse-label">{label}</span>
					</span>
				))}
			</div>
		</div>
	);
}
