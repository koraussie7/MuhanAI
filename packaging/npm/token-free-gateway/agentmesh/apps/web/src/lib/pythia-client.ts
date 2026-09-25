/**
 * Pythia API client — calls muhanai.com's Token-Free Gateway endpoints.
 * Zero API key, zero token cost.
 */
export interface PythiaSession {
	id: string;
	file: string;
	prompt: string;
	status: "running" | "completed" | "error";
	provider: string;
	createdAt: string;
}

export interface PythiaSessionResult {
	sessionId: string;
	response: string;
	file: string;
	provider: string;
	latencyMs: number;
	tier: string;
	cost: string;
}

export interface CreateSessionRequest {
	file: string;
	prompt: string;
	model?: string;
	system?: string;
}

export async function listPythiaModels(): Promise<string[]> {
	const res = await fetch("/api/pythia/models");
	if (!res.ok) throw new Error(`Models fetch failed: ${res.status}`);
	const data = await res.json() as { models?: string[] };
	return data.models ?? ["auto"];
}

export async function listPythiaSessions(): Promise<PythiaSession[]> {
	const res = await fetch("/api/pythia/sessions");
	if (!res.ok) throw new Error(`Sessions fetch failed: ${res.status}`);
	const data = await res.json() as { sessions?: PythiaSession[] };
	return data.sessions ?? [];
}

export async function runPythiaSession(
	req: CreateSessionRequest,
): Promise<PythiaSessionResult> {
	const res = await fetch("/api/pythia/session", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(req),
	});
	if (!res.ok) throw new Error(`Pythia session failed: ${res.status}`);
	return (await res.json()) as PythiaSessionResult;
}

export async function stopPythiaSession(sessionId: string): Promise<void> {
	await fetch(`/api/pythia/session/${sessionId}`, {
		method: "DELETE",
		credentials: "include",
	});
}

// ---------------------------------------------------------------------------
// Cosmic graph read models (/api/pythia/graph/*)
// ---------------------------------------------------------------------------

/** Mirrors GraphConceptView in services/api/src/cosmos-routes.ts. */
export interface GraphConcept {
	id: string;
	label: string;
	domain: string;
	status: string;
	signalScore: number;
	effectiveStatus: "raw" | "validated" | "amplified";
}

/** Mirrors OntologyRelation in the cosmos projection. */
export interface GraphRelation {
	id: string;
	sourceId: string;
	targetId: string;
	predicate: string;
	strength: number;
}

export interface GraphEvent {
	id: string;
	kind: string;
	source: string;
	timestamp: string;
}

export interface PythiaProvider {
	name: string;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
	try {
		const res = await fetch(path, { credentials: "include" });
		if (!res.ok) return fallback;
		return (await res.json()) as T;
	} catch {
		return fallback;
	}
}

export async function listGraphConcepts(): Promise<GraphConcept[]> {
	const data = await getJson<{ concepts?: GraphConcept[] }>("/api/pythia/graph/concepts", {});
	return data.concepts ?? [];
}

export async function listGraphRelations(): Promise<GraphRelation[]> {
	const data = await getJson<{ relations?: GraphRelation[] }>("/api/pythia/graph/relations", {});
	return data.relations ?? [];
}

export async function listGraphEvents(): Promise<GraphEvent[]> {
	const data = await getJson<{ events?: GraphEvent[] }>("/api/pythia/graph/events", {});
	return data.events ?? [];
}

export async function listPythiaProviders(): Promise<string[]> {
	const data = await getJson<{ providers?: string[] }>("/api/pythia/providers", {});
	return data.providers ?? [];
}
