import { randomUUID } from "node:crypto";
import { createLibp2pTransport } from "@agentmesh/federation-transport";
import { getLogger } from "@agentmesh/shared";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { agentsRoutes } from "./agents-routes.js";
import { authRoutes } from "./auth-routes.js";
import { computeRoutes } from "./compute-routes.js";
import { computerUseRoutes } from "./computer-use-routes.js";
import { creditsRoutes } from "./credits-routes.js";
import { feedRoutes } from "./feed-routes.js";
import { PulseBridge } from "./gossip-bridge.js";
import { happyRoutes } from "./happy-routes.js";
import { hivebearRoutes } from "./hivebear-routes.js";
import { knowledgeRoutes } from "./knowledge-routes.js";
import { llmMeshRoutes } from "./llm-mesh-routes.js";
import { llmRoutes } from "./llm-routes.js";
import { networkRoutes } from "./network-routes.js";
import { noemaRoutes } from "./noema-routes.js";
import { omniRouteRoutes } from "./omniroute-routes.js";
import pulseRoutes from "./pulse-routes.js";
import { quorumRoutes } from "./quorum-routes.js";
import { securityRoutes } from "./security-routes.js";
import { semanticRoutes } from "./semantic-routes.js";

function timingSafeEqual(a: string | undefined, b: string | undefined): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

const PUBLIC_PATH_PREFIXES = [
	"/api/pulse",
	"/api/network",
	"/api/agents",
	"/api/auth",
	"/api/health",
];
const PUBLIC_PATH_EXACT = new Set(["/health"]);

function isPublicPath(rawUrl: string | undefined): boolean {
	if (!rawUrl) return false;
	const path = rawUrl.split("?")[0];
	if (!path) return false;
	if (PUBLIC_PATH_EXACT.has(path)) return true;
	return PUBLIC_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export interface BuildAppOptions {
	logger?: ReturnType<typeof getLogger>;
	/**
	 * Spin up a real libp2p node and wire its PulseSource into the bridge.
	 * Defaults to `true` unless NODE_ENV=test (so unit tests stay hermetic).
	 * Tests can also pass `false` explicitly.
	 */
	enableTransport?: boolean;
	/** Path to the local node identity file. */
	identityPath?: string;
}

export async function buildApp(options: BuildAppOptions = {}) {
	const isProduction = process.env.NODE_ENV === "production";
	const logger = options.logger ?? getLogger({ service: "api" });
	const enableTransport = options.enableTransport ?? process.env.NODE_ENV !== "test";
	const identityPath = options.identityPath ?? "./.agentmesh/identity.json";

	const app = Fastify({
		loggerInstance: logger,
		bodyLimit: 1024 * 1024, // 1MB explicit body cap (DoS protection)
		genReqId(req) {
			const incoming = req.headers["x-request-id"];
			if (typeof incoming === "string" && incoming.length > 0 && incoming.length < 256) {
				return incoming;
			}
			return randomUUID();
		},
		disableRequestLogging: false,
	});

	// Pulse bridge: singleton fan-out between the libp2p PulseSource (attached
	// later, when the node starts) and any number of SSE sinks (per-client).
	// Degraded mode (no source) emits heartbeats only.
	app.decorate("pulseBridge", new PulseBridge({ logger: logger as never }));
	app.pulseBridge.start();

	// Security headers (helmet). CSP off — when a real policy is wired it should
	// be passed explicitly so it can be reviewed in one place.
	await app.register(helmet, {
		contentSecurityPolicy: false,
		crossOriginEmbedderPolicy: false,
	});

	// CORS: restrict to known origins in production, allow localhost in development
	const allowedOrigins = isProduction
		? (process.env.ALLOWED_ORIGINS?.split(",") ?? [
				"https://muhanai.com",
				"https://www.muhanai.com",
			])
		: ["http://localhost:3000", "http://localhost:5173", "http://localhost:3001"];

	await app.register(cors, {
		origin: (origin, cb) => {
			if (!origin) return cb(null, true); // mobile/curl: no Origin header
			if (allowedOrigins.includes(origin)) {
				cb(null, true);
			} else {
				cb(new Error("Not allowed by CORS"), false);
			}
		},
		credentials: true,
	});

	// Per-key (or per-IP fallback) rate limiting. /health is exempt so
	// orchestrators can probe without burning budget.
	await app.register(rateLimit, {
		max: Number(process.env.RATE_LIMIT_MAX ?? 120),
		timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
		skipOnError: true,
		keyGenerator(req) {
			const key = req.headers["x-api-key"];
			if (typeof key === "string" && key.length > 0 && key.length < 256) {
				return `api:${key}`;
			}
			return req.ip;
		},
		allowList: (req) => {
			const url = req.url ?? "";
			return url === "/health" || url.startsWith("/health?");
		},
	});

	// API Key authentication for non-public routes. Fail-closed: an unset
	// API_KEY blocks every protected request rather than serving them open.
	if (!process.env.API_KEY && isProduction) {
		logger.warn(
			"API_KEY env var is unset in production — every protected request will be rejected with 401. Set API_KEY before serving traffic.",
		);
	}

	if (process.env.DISABLE_AUTH === "true" && isProduction) {
		logger.warn(
			"DISABLE_AUTH=true is set in production but will be ignored. Auth is mandatory in production.",
		);
	}

	app.addHook("onRequest", async (request, reply) => {
		if (isPublicPath(request.url)) return;
		if (!isProduction && process.env.DISABLE_AUTH === "true") return;

		const validApiKey = process.env.API_KEY;
		const rawApiKey = request.headers["x-api-key"];
		const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey;

		if (!timingSafeEqual(apiKey, validApiKey)) {
			return reply.code(401).send({ error: "Unauthorized: invalid or missing API key" });
		}
	});

	// Expose the request id on the response so clients can correlate with logs.
	app.addHook("onSend", async (request, reply, payload) => {
		if (request.id) {
			reply.header("x-request-id", request.id);
		}
		return payload;
	});

	await app.register(noemaRoutes);
	await app.register(semanticRoutes);
	await app.register(hivebearRoutes);
	await app.register(knowledgeRoutes);
	await app.register(networkRoutes);
	await app.register(agentsRoutes);
	await app.register(computeRoutes);
	await app.register(llmMeshRoutes);
	await app.register(llmRoutes);
	await app.register(computerUseRoutes);
	await app.register(happyRoutes);
	await app.register(creditsRoutes);
	await app.register(securityRoutes);
	await app.register(feedRoutes);
	await app.register(authRoutes);
	await app.register(pulseRoutes);
	await app.register(quorumRoutes);
	await app.register(omniRouteRoutes);

	// Wire the libp2p transport into the bridge. Best-effort: any failure here
	// (mDNS unavailable on Docker bridge, identity write denied, etc.) keeps
	// the bridge in degraded mode — SSE clients still see a live stream of
	// heartbeats rather than a hung connection.
	let transportStop: (() => Promise<void>) | null = null;
	if (enableTransport) {
		const transport = createLibp2pTransport({ identityPath });
		void transport
			.start()
			.then(() => {
				const source = transport.getPulseSource();
				if (source) {
					app.pulseBridge.setSource(source);
					logger.info("pulse bridge: source attached");
				} else {
					logger.warn("pulse bridge: transport started but produced no source");
				}
			})
			.catch((err: unknown) => {
				logger.warn(
					{ err: (err as Error).message },
					"transport start failed; pulse bridge remains in degraded mode",
				);
			});
		transportStop = () => transport.stop();
	}

	// Clean shutdown: stop transport (if any) before stopping the bridge so
	// the bridge isn't tearing down sinks while messages are still in flight.
	app.addHook("onClose", async () => {
		if (transportStop) {
			try {
				await transportStop();
			} catch (err) {
				logger.warn({ err: (err as Error).message }, "transport stop failed");
			}
		}
		app.pulseBridge.stop();
	});

	return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	const app = await buildApp();
	try {
		await app.listen({ port: 3001, host: "0.0.0.0" });
		app.log.info("API server listening on http://0.0.0.0:3001");
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
}
