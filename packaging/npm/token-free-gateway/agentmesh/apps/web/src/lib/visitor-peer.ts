export interface VisitorPeerSession {
	peerId: string;
	token: string;
	heartbeatEveryMs: number;
	expiresAfterMs: number;
}

interface EnrollResponse {
	peer: { id: string };
	token: string;
	heartbeatEveryMs: number;
	expiresAfterMs: number;
}

let heartbeatTimer: number | undefined;

export async function enrollVisitorPeer(): Promise<VisitorPeerSession | null> {
	try {
		const response = await fetch("/api/visitors/enroll", {
			method: "POST",
			headers: { "content-type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				path: window.location.pathname,
				capabilities: ["presence", "pulse-read"],
			}),
		});
		if (!response.ok) return null;

		const data = (await response.json()) as EnrollResponse;
		const session: VisitorPeerSession = {
			peerId: data.peer.id,
			token: data.token,
			heartbeatEveryMs: data.heartbeatEveryMs,
			expiresAfterMs: data.expiresAfterMs,
		};
		startVisitorHeartbeat(session);
		return session;
	} catch {
		return null;
	}
}

function startVisitorHeartbeat(session: VisitorPeerSession): void {
	stopVisitorHeartbeat();
	heartbeatTimer = window.setInterval(() => {
		void fetch("/api/visitors/heartbeat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ token: session.token, path: window.location.pathname }),
		}).catch(() => {
			// The server expires inactive visitors; transient failures need no UI error.
		});
	}, session.heartbeatEveryMs);
}

export function stopVisitorHeartbeat(): void {
	if (heartbeatTimer !== undefined) {
		window.clearInterval(heartbeatTimer);
		heartbeatTimer = undefined;
	}
}
