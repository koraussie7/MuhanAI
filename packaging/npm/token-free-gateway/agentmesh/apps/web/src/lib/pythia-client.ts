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
