export interface A2UIActionRequest {
	surfaceId: string;
	name: string;
	arguments?: Record<string, unknown>;
}

export interface A2UIActionEvent {
	type: string;
	surfaceId: string;
	data: Record<string, unknown>;
	timestamp: number;
}

export async function dispatchA2UIAction(request: A2UIActionRequest): Promise<A2UIActionEvent> {
	const response = await fetch("/api/a2ui/actions", {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify(request),
	});
	const body = (await response.json().catch(() => null)) as A2UIActionEvent | { error?: string } | null;
	if (!response.ok) throw new Error(body && "error" in body ? body.error ?? `Action failed (${response.status})` : `Action failed (${response.status})`);
	return body as A2UIActionEvent;
}

export function subscribeToA2UIEvents(
	surfaceId: string,
	onEvent: (event: A2UIActionEvent) => void,
): () => void {
	const source = new EventSource(`/api/a2ui/events/${encodeURIComponent(surfaceId)}`);
	const handleMessage = (event: MessageEvent<string>) => {
		try {
			onEvent(JSON.parse(event.data) as A2UIActionEvent);
		} catch {
			// Ignore malformed stream frames; the next event can still be processed.
		}
	};
	source.onmessage = handleMessage;
	source.addEventListener("action.accepted", handleMessage);
	source.addEventListener("action.rejected", handleMessage);
	return () => source.close();
}
