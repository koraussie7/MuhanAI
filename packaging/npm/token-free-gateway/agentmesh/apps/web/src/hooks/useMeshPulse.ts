import { useEffect, useState } from "react";
import { getMeshStats, ingestApiPayload, type MeshStats } from "../lib/mesh-stats.js";

const API = "";

export interface PulsePayload {
	newQuestions?: number;
	verifyRequests?: number;
	humansNeeded?: number;
	aiConflicts?: number;
	knowledgeGaps?: number;
	mcpTasksWaiting?: number;
	agentsOnline?: number;
	humansOnline?: number;
	peers?: number;
	_demo?: boolean;
}

export function useMeshPulse(pollMs = 10_000): {
	pulse: PulsePayload | null;
	stats: MeshStats;
	error: string | null;
} {
	const [pulse, setPulse] = useState<PulsePayload | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const controller = new AbortController();

		const load = async () => {
			try {
				const res = await fetch(`${API}/api/pulse`, { signal: controller.signal });
				if (!res.ok) {
					setError(`pulse ${res.status}`);
					return;
				}
				const data = (await res.json()) as PulsePayload;
				ingestApiPayload(data);
				setPulse(data);
				setError(null);
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					setError((e as Error).message ?? "pulse fetch failed");
				}
			}
		};

		void load();
		const id = setInterval(load, pollMs);
		return () => {
			clearInterval(id);
			controller.abort();
		};
	}, [pollMs]);

	const stats = getMeshStats(pulse ?? {});
	return { pulse, stats, error };
}
