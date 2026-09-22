/**
 * World Engine API client — fetches Pythia World Engine data from muhanai.com.
 */
import type { WorldEvent, WorldPrediction } from "./world-types";

export interface WorldBrief {
	source: "pythia" | "offline";
	summary: string;
	domains: string[];
	events: WorldEvent[];
	predictions: WorldPrediction[];
	fetchedAt: string;
}

export async function fetchWorldBrief(): Promise<WorldBrief> {
	const res = await fetch("/api/world/brief", { credentials: "include" });
	if (!res.ok) {
		throw new Error(`World brief failed: ${res.status}`);
	}
	return (await res.json()) as WorldBrief;
}
