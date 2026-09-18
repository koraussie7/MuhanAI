export async function load<T>(path: string, init?: RequestInit): Promise<T | null> {
	const response = await fetch(path, {
		...init,
		headers: { accept: "application/json", ...(init?.headers ?? {}) },
	});
	if (!response.ok) return null;
	return (await response.json()) as T;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const error = (await response.json().catch(() => null)) as { error?: string } | null;
		throw new Error(error?.error ?? `Request failed (${response.status})`);
	}
	return (await response.json()) as T;
}
