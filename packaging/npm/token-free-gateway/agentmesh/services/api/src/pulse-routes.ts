/**
 * Pulse routes — SSE fan-out for live mesh events.
 *
 *   GET /api/pulse/stream        text/event-stream; emits PulseMessage + heartbeats
 *   GET /api/pulse/status        JSON snapshot of bridge state (sink count, source attached)
 *
 * Architecture (per docs/WORKTREE-PLAN.md W4):
 *   client → pulse-routes (HTTP/SSE) → pulse-stream (writer) → gossip-bridge (fan-out)
 *                                                       ↑
 *                                              @agentmesh/p2p.PulseSource
 *
 * The bridge is held in a per-app singleton via `app.pulseBridge`. server.ts
 * is responsible for attaching the PulseSource once the libp2p node starts.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import type { PulseBridge } from "./gossip-bridge.js";
import { attachSsePulseSink } from "./pulse-stream.js";

declare module "fastify" {
	interface FastifyInstance {
		pulseBridge: PulseBridge;
	}
}

const pulseRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
	app.get("/api/pulse/stream", (_request: FastifyRequest, reply) => {
		const bridge = app.pulseBridge;
		if (!bridge) {
			// Fail loud — if the server wired us up without a bridge, that's a bug.
			return reply.code(500).send({ error: "pulse bridge not configured" });
		}

		// Hijack the response so Fastify doesn't try to serialize a return value.
		reply.hijack();
		const raw = reply.raw;

		raw.statusCode = 200;
		raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
		raw.setHeader("Cache-Control", "no-cache, no-transform");
		raw.setHeader("Connection", "keep-alive");
		raw.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
		raw.flushHeaders?.();

		const { sink, dispose } = attachSsePulseSink({ stream: raw });
		bridge.attach(sink);

		// Emit an immediate heartbeat so curl / EventSource sees the connection
		// establish before the first inbound message arrives.
		sink.heartbeat?.(Date.now());

		// Clean up when the client disconnects.
		const onClose = () => {
			bridge.detach(sink);
			dispose();
		};
		raw.once("close", onClose);
		raw.once("error", onClose);
	});

	app.get("/api/pulse/status", async (_request, reply) => {
		const bridge = app.pulseBridge;
		if (!bridge) {
			return reply.code(500).send({ error: "pulse bridge not configured" });
		}
		return bridge.size();
	});
};

export default pulseRoutes;
