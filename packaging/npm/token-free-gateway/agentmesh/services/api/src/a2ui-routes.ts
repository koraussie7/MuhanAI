import {
	type A2UIMessage,
	applyA2UI,
	parseA2UIJsonl,
	validateA2UI,
	validateA2UITree,
} from "@agentmesh/mcp";
import type { FastifyInstance } from "fastify";

interface JsonlBody {
	jsonl?: string;
	messages?: A2UIMessage[];
}

interface A2UIActionBody {
	surfaceId?: string;
	name?: string;
	arguments?: Record<string, unknown>;
}

export interface A2UIEvent {
	type: "surface.ready" | "action.accepted" | "action.rejected";
	surfaceId: string;
	data: Record<string, unknown>;
	timestamp: number;
}

/** Exposed for tests so each case starts from a clean subscriber registry. */
export const eventSubscribers = new Map<string, Set<(event: A2UIEvent) => void>>();
const allowedActions = new Set(["request_reservation"]);

export function publish(event: A2UIEvent): void {
	for (const subscriber of eventSubscribers.get(event.surfaceId) ?? []) subscriber(event);
}

export async function a2uiRoutes(app: FastifyInstance) {
	app.post<{ Body: JsonlBody }>("/api/a2ui/validate", async (request, reply) => {
		const messages = request.body?.messages;
		if (!Array.isArray(messages))
			return reply.code(400).send({ error: "messages must be an array" });
		return validateA2UI(messages);
	});

	app.post<{ Body: A2UIActionBody }>("/api/a2ui/actions", async (request, reply) => {
		const surfaceId = request.body?.surfaceId?.trim();
		const name = request.body?.name?.trim();
		if (!surfaceId || !name)
			return reply.code(400).send({ error: "surfaceId and name are required" });
		if (!allowedActions.has(name)) return reply.code(403).send({ error: "action_not_allowed" });
		const event: A2UIEvent = {
			type: "action.accepted",
			surfaceId,
			data: { name, arguments: request.body.arguments ?? {}, status: "queued" },
			timestamp: Date.now(),
		};
		publish(event);
		return reply.code(202).send(event);
	});

	app.get("/api/a2ui/events/:surfaceId", async (request, reply) => {
		const { surfaceId } = request.params as { surfaceId: string };
		reply.hijack();
		reply.raw.writeHead(200, {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			connection: "keep-alive",
		});
		const send = (event: A2UIEvent) =>
			reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
		const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
		const subscribers = eventSubscribers.get(surfaceId) ?? new Set();
		subscribers.add(send);
		eventSubscribers.set(surfaceId, subscribers);
		request.raw.on("close", () => {
			clearInterval(heartbeat);
			subscribers.delete(send);
			if (subscribers.size === 0) eventSubscribers.delete(surfaceId);
		});
	});

	app.post<{ Body: JsonlBody }>("/api/a2ui/fold", async (request, reply) => {
		try {
			const messages = request.body?.jsonl
				? parseA2UIJsonl(request.body.jsonl)
				: request.body?.messages;
			if (!Array.isArray(messages)) {
				return reply.code(400).send({ error: "jsonl or messages is required" });
			}
			const state = applyA2UI(messages);
			const tree = validateA2UITree(state);

			// Notify SSE subscribers that the surface is ready for interaction.
			// Published after fold so the client receives the final data model
			// alongside the signal. When there are no live subscribers this is a no-op.
			if (state.status === "ready" && state.surfaceId) {
				publish({
					type: "surface.ready",
					surfaceId: state.surfaceId,
					data: { catalogId: state.catalogId ?? "", root: state.root ?? "" },
					timestamp: Date.now(),
				});
			}

			return { state, tree };
		} catch (error) {
			return reply.code(400).send({
				error: "invalid_a2ui",
				message: error instanceof Error ? error.message : "Invalid A2UI payload",
			});
		}
	});
}
