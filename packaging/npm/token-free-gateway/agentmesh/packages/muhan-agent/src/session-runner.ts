/**
 * SessionRunner — in-process session lifecycle for the daemon.
 *
 * A session request, once decrypted by session-decrypt.ts, is a JSON
 * payload that the runner consumes. The runner emits a response
 * synchronously (sessions are short-lived and request/response-shaped
 * for now; streaming lands in a later phase).
 *
 * Phase 1 keeps the runner deliberately simple:
 *   - Spawn = bind a per-sessionId handler
 *   - Respond = call the handler with the decrypted payload
 *   - Teardown = unbind the handler
 *
 * Phase 2 (L5) will replace the trivial echo handler with a real MCP
 * router — see session-router.ts.
 */

export interface SessionRequest {
	/** Logical tool/capability name (e.g. "personal-context"). */
	capability: string;
	/** Capability-specific payload. */
	args?: Record<string, unknown>;
	/** Free-form correlation id; echoed in the response. */
	correlationId?: string;
}

export interface SessionResponse {
	correlationId?: string;
	ok: boolean;
	result?: unknown;
	error?: string;
}

export type SessionHandler = (req: SessionRequest) => Promise<SessionResponse>;

export interface SessionRunner {
	register(capability: string, handler: SessionHandler): void;
	handle(req: SessionRequest): Promise<SessionResponse>;
	teardown(sessionId: string): void;
	activeSessions(): number;
}

/**
 * Build a runner that lives inside the daemon. The daemon hands each
 * decrypted session to `runner.handle()` and the runner returns a
 * response. No long-lived state; `teardown` is a no-op for now but
 * exists so streaming sessions can release resources cleanly later.
 */
export function createSessionRunner(): SessionRunner {
	const handlers = new Map<string, SessionHandler>();
	const active = new Set<string>();

	return {
		register(capability, handler) {
			handlers.set(capability, handler);
		},
		async handle(req) {
			const handler = handlers.get(req.capability);
			if (!handler) {
				return {
					ok: false,
					correlationId: req.correlationId,
					error: `unknown capability: ${req.capability}`,
				};
			}
			return handler(req);
		},
		teardown(_sessionId) {
			active.delete(_sessionId);
		},
		activeSessions() {
			return active.size;
		},
	};
}
