/**
 * Error response helpers for the API.
 *
 * Goals (1-7 — error message minimization):
 *   - Never leak internal stack traces or filesystem paths to clients.
 *   - Never leak Zod's internal `path` array (which exposes our schema
 *     field names) — only the human-friendly message is shown.
 *   - All server-side errors are logged in full at the appropriate level
 *     so operators retain debuggability.
 *
 * Clients receive a stable, short error shape:
 *   { error: "<category>: <safe message>", requestId: "<uuid>" }
 *
 * The requestId lets operators correlate the truncated response with the
 * full server-side log line.
 */

import type { FastifyReply } from "fastify";

export interface ClientErrorBody {
	error: string;
	requestId?: string;
}

export function clientError(
	reply: FastifyReply,
	status: number,
	message: string,
	requestId?: string,
): FastifyReply {
	const body: ClientErrorBody = { error: message };
	if (requestId) body.requestId = requestId;
	return reply.code(status).send(body);
}

/**
 * Format a Zod `SafeParseError` for client display.
 *
 * Zod's `error.message` includes the full path (e.g. "Required at
 * body.knowledge[0].tags") which leaks schema shape. We strip that and
 * keep only the first issue's `message` plus the top-level field name.
 *
 * Fastify injects a leading `body` (or `params` / `querystring`) segment
 * depending on which parser produced the issue; we strip that prefix so
 * the client only sees the user-facing field name.
 */
export function formatZodError(error: {
	issues: Array<{ path: ReadonlyArray<unknown>; message: string }>;
}): string {
	const first = error.issues[0];
	if (!first) return "Invalid request";
	const raw = first.path
		.filter((p): p is string | number => typeof p === "string" || typeof p === "number")
		.map((p) => String(p));
	const segments =
		raw[0] === "body" || raw[0] === "params" || raw[0] === "querystring" ? raw.slice(1) : raw;
	const field = segments.join(".");
	return field ? `${field}: ${first.message}` : first.message;
}

/**
 * Wrap an async route handler so that any thrown error becomes a
 * generic 500 to the client with the original logged at error level.
 */
export function withSafeErrors<TArgs extends unknown[], TResult>(
	reply: FastifyReply,
	handler: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | undefined> {
	return async (...args: TArgs): Promise<TResult | undefined> => {
		try {
			return await handler(...args);
		} catch (err) {
			reply.log.error({ err }, "route handler threw");
			const requestId = reply.request.id;
			clientError(reply, 500, "Internal server error", requestId);
			return undefined;
		}
	};
}
