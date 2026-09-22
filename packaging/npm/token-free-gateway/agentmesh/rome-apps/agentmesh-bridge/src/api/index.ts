import type {
	RomeAppApiHandler,
	RomeAppApiRequest,
	RomeAppContext,
} from "@rome-os/app-runtime";
import { gatewayHealth, routeQuestion } from "../lib/gateway.js";

function json(data: unknown, init?: ResponseInit): Response {
	return Response.json(data, init);
}

function readJsonBody(request: RomeAppApiRequest): unknown {
	if (!request.body || request.body.byteLength === 0) return null;
	const text = new TextDecoder().decode(request.body);
	try {
		return JSON.parse(text);
	} catch {
		return undefined; // signal malformed JSON
	}
}

/**
 * API surface: POST /route, GET /status.
 * The host resolves `request.caller` before this handler runs; guardian-only
 * routes reject non-guardian callers here rather than trusting headers.
 */
export function createApiHandler(ctx: RomeAppContext): RomeAppApiHandler {
	return {
		async handle(request: RomeAppApiRequest): Promise<Response> {
			const route = request.path.join("/");
			const env = process.env as Record<string, string | undefined>;

			if (request.caller.kind !== "guardian") {
				return json({ error: "forbidden" }, { status: 403 });
			}

			if (request.method === "GET" && route === "status") {
				const health = await gatewayHealth({ env });
				return json(
					{
						appId: ctx.app.id,
						gatewayOnline: health.ok,
						error: health.error,
					},
					{ status: health.ok ? 200 : 502 },
				);
			}

			if (request.method === "POST" && route === "route") {
				const body = readJsonBody(request) as { userId?: unknown; question?: unknown } | null;
				if (
					!body ||
					typeof body.userId !== "string" ||
					typeof body.question !== "string" ||
					body.question.length === 0
				) {
					return json({ error: "invalid_body" }, { status: 400 });
				}
				const result = await routeQuestion({
					userId: body.userId,
					question: body.question,
				}, { env });
				if (!result.ok || !result.data) {
					return json({ error: result.error ?? "gateway_error" }, { status: 502 });
				}
				return json(result.data, { status: 200 });
			}

			return json({ error: "not_found" }, { status: 404 });
		},
	};
}
