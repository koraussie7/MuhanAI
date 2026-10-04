/**
 * Lightweight hook that subscribes to a `/api/mesh/pulse` SSE stream and exposes
 * the latest peer count, byte counters, and an explicit reload helper.
 *
 * Restored alongside the WorldGlobe, because Sidebar and WorldGlobe previously
 * imported this hook from `../hooks/useMeshPulse.js`. The full server endpoint
 * is owned by `services/api`; when it is unreachable we fall back to a steady
 * "unknown" placeholder so the UI never crashes.
 */

import { useEffect, useRef, useState } from "react";

export interface MeshPulseSample {
	peers: number;
	bytesUp: number;
	bytesDown: number;
	latencyMs: number;
	updatedAt: number;
}

export interface MeshPulseStats {
	peers: number;
	agentsOnline?: number;
	bytesUp: number;
	bytesDown: number;
}

export interface MeshPulseState {
	sample: MeshPulseSample | null;
	connected: boolean;
	error?: string;
	stats: MeshPulseStats;
	reload: () => void;
}

const PLACEHOLDER: MeshPulseSample = {
	peers: 0,
	bytesUp: 0,
	bytesDown: 0,
	latencyMs: 0,
	updatedAt: 0,
};

const POLL_MS = 15000;

export function useMeshPulse(endpoint = "/api/mesh/pulse"): MeshPulseState {
	const [sample, setSample] = useState<MeshPulseSample | null>(null);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [tick, setTick] = useState(0);
	const cancelled = useRef(false);

	useEffect(() => {
		cancelled.current = false;
		const controller = new AbortController();

		const load = async () => {
			try {
				const response = await fetch(endpoint, { signal: controller.signal });
				if (!response.ok) throw new Error(`status ${response.status}`);
				const data = (await response.json()) as Partial<MeshPulseSample>;
				setSample({
					peers: Number(data.peers ?? 0),
					bytesUp: Number(data.bytesUp ?? 0),
					bytesDown: Number(data.bytesDown ?? 0),
					latencyMs: Number(data.latencyMs ?? 0),
					updatedAt: Date.now(),
				});
				setConnected(true);
				setError(undefined);
			} catch (e) {
				if (cancelled.current) return;
				setConnected(false);
				setError(e instanceof Error ? e.message : "mesh pulse offline");
				setSample((prev) => prev ?? PLACEHOLDER);
			}
		};

		void load();
		const timer = setInterval(load, POLL_MS);
		return () => {
			cancelled.current = true;
			controller.abort();
			clearInterval(timer);
		};
	}, [endpoint, tick]);

	return {
		sample: sample ?? PLACEHOLDER,
		connected,
		error,
		stats: {
			peers: (sample ?? PLACEHOLDER).peers,
			agentsOnline: (sample ?? PLACEHOLDER).peers,
			bytesUp: (sample ?? PLACEHOLDER).bytesUp,
			bytesDown: (sample ?? PLACEHOLDER).bytesDown,
		},
		reload: () => setTick((value) => value + 1),
	};
}
