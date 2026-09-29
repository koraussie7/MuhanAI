import { randomUUID } from "node:crypto";
import { createLibp2pTransport } from "@agentmesh/federation";
import { getLogger } from "@agentmesh/shared-types";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import a2aRoutes, { setAgentRegistry } from "./a2a-routes.js";
import { a2uiRoutes } from "./a2ui-routes.js";
import { agentsRoutes } from "./agents-routes.js";
import { authRoutes } from "./auth-routes.js";
import { catalogRoutes } from "./catalog-routes.js";
import { collaborationRoutes } from "./collaboration-routes.js";
import { computeRoutes } from "./compute-routes.js";
import { computerUseRoutes } from "./computer-use-routes.js";
import { cosmosRoutes } from "./cosmos-routes.js";
import { creditsRoutes } from "./credits-routes.js";
import { elizaosRpcRoutes } from "./elizaos-rpc-routes.js";
import { factoryRoutes } from "./factory-routes.js";
import { feedRoutes } from "./feed-routes.js";
import { ghostDispatchRoutes } from "./ghost-dispatch-routes.js";
import { ghostRoutes } from "./ghost-routes.js";
import { PulseBridge } from "./gossip-bridge.js";
import { happyRoutes } from "./happy-routes.js";
import { hivebearRoutes } from "./hivebear-routes.js";
import { resonanceRoutes } from "./integrations/resonance/routes.js";
import { knowledgeRoutes } from "./knowledge-routes.js";
import { listRoutes } from "./list-routes.js";
import { llmMeshRoutes } from "./llm-mesh-routes.js";
import { llmRoutes } from "./llm-routes.js";
import { mcpRoutes } from "./mcp-routes.js";
import { networkRoutes } from "./network-routes.js";
import { noemaRoutes } from "./noema-routes.js";
import { omniRouteRoutes } from "./omniroute-routes.js";
import { openaiCompatRoutes } from "./openai-compat-routes.js";
import { opsmaxxMcpRoutes } from "./opsmaxx-mcp-routes.js";
import { paymentRoutes } from "./payment-routes.js";
import pulseRoutes from "./pulse-routes.js";
import { pythiaRoutes } from "./pythia-routes.js";
import { quorumRoutes } from "./quorum-routes.js";
import { routerRoutes } from "./router-routes.js";
import { securityRoutes } from "./security-routes.js";
import { semanticRoutes } from "./semantic-routes.js";
import { shoppingRoutes } from "./shopping-routes.js";
import { vietnamRoutes } from "./vietnam-routes.js";
import { visitorRoutes } from "./visitor-routes.js";
import { worldRoutes } from "./world-routes.js";

function timingSafeEqual(a: string | undefined, b: string | undefined): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	if (a.length === 0 || b.length === 0) return false;
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

/** Bridge 앱 전용 가드: AGENTMESH_BRIDGE_TOKEN Bearer 토큰 검증 */
function isBridgeAuth(
	request: { headers: Record<string, string | string[] | undefined> },
	bridgeToken: string | undefined,
): boolean {
	if (!bridgeToken) return false;
	const authHeader = request.headers.authorization;
	if (!authHeader || typeof authHeader !== "string") return false;
	if (!authHeader.startsWith("Bearer ")) return false;
	const token = authHeader.slice("Bearer ".length);
	return timingSafeEqual(token, bridgeToken);
}

// AgentMesh Bridge ↔ Rome app 토큰 가드
//   - bridge 앱이 Rome 런타임에서 실행될 때 사용하는 BEARER 토큰.
//   - 환경변수가 없으면 가드 비활성 (개발 환경 편의를 위해).
//   - 라이브 환경에서는 둘 다 동일하게 설정한다.
//   - 모듈 로드가 아니라 빌드 시점(buildApp)에 읽어, 테스트가 환경변수로
//     가드 on/off 를 제어할 수 있게 한다 (API_KEY 와 같은 패턴).
function resolveBridgeToken(): string | undefined {
	const raw = process.env.AGENTMESH_BRIDGE_TOKEN;
	return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

const PUBLIC_PATH_PREFIXES = [
	"/api/collaboration",
	"/api/pulse",
	"/api/network",
	"/api/agents",
	"/api/nodes",
	"/api/visitors",
	"/api/auth",
	"/api/health",
	"/api/vietnam",
	"/rpc",
	"/api/mcp",
];
const PUBLIC_PATH_EXACT = new Set(["/health", "/.well-known/mcp.json", "/.well-known/agent.json"]);

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
	/**
	 * Inject an OpsMaxx bridge for tests and for production wiring.
	 * When omitted, the MCP routes fall back to an in-memory bridge.
	 * Production should pass the IPC client (T1-P2) created from
	 * `@agentmesh/opsmaxx-bridge`.
	 */
	opsmaxxBridge?: unknown;
}

export async function buildApp(options: BuildAppOptions = {}) {
	const isProduction = process.env.NODE_ENV === "production";
	const bridgeToken = resolveBridgeToken();
	const logger = options.logger ?? getLogger({ service: "api" });
	const enableTransport = options.enableTransport ?? process.env.NODE_ENV !== "test";
	const identityPath = options.identityPath ?? "./.agentmesh/identity.json";

	const placeholderPattern = /^(your-|change-me|placeholder|fake-|secret-key-here|example-key)/i;
	if (isProduction) {
		if (!process.env.API_KEY) {
			throw new Error(
				"API_KEY env var is unset in production — refusing to start. Set API_KEY before serving traffic.",
			);
		}
		if (placeholderPattern.test(process.env.API_KEY)) {
			throw new Error(
				"API_KEY matches a known placeholder pattern in production — refusing to start. Set a secure random API key.",
			);
		}
		if (!process.env.AUTH_SECRET) {
			throw new Error(
				"AUTH_SECRET env var is unset in production — refusing to start. Generate with: openssl rand -hex 32",
			);
		}
		if (placeholderPattern.test(process.env.AUTH_SECRET)) {
			throw new Error(
				"AUTH_SECRET matches a known placeholder pattern in production — refusing to start.",
			);
		}
	}

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

	// OpsMaxx bridge: when caller injects one (T1-P2 IPC client or
	// test mock), decorate so the MCP routes pick it up. Otherwise
	// the routes fall back to a fresh in-memory bridge per call.
	if (options.opsmaxxBridge) {
		app.decorate("opsmaxxBridge", options.opsmaxxBridge as never);
	}

	// Security headers (helmet). CSP off — when a real policy is wired it should
	// be passed explicitly so it can be reviewed in one place.
	await app.register(helmet, {
		contentSecurityPolicy: false,
		crossOriginEmbedderPolicy: false,
	});

	// CORS: restrict to known origins in production, allow localhost in development
	const defaultProdOrigins = ["https://muhanai.com", "https://www.muhanai.com"];
	const allowedOrigins = isProduction
		? process.env.ALLOWED_ORIGINS
			? process.env.ALLOWED_ORIGINS.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: defaultProdOrigins
		: ["http://localhost:3000", "http://localhost:5173", "http://localhost:3001"];

	if (isProduction && allowedOrigins.length === 0) {
		throw new Error(
			"ALLOWED_ORIGINS is empty in production — refusing to start. Set ALLOWED_ORIGINS to a comma-separated list of trusted origins.",
		);
	}

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

	// API Key authentication for non-public routes.
	// Auth is always required in production; disableAuth is dev-only.
	let disableAuth = false;
	if (process.env.DISABLE_AUTH === "true" && !isProduction) {
		disableAuth = true;
		logger.warn(
			"Auth is DISABLED — dev mode. Set DISABLE_AUTH=false or NODE_ENV=production to enforce API key auth.",
		);
	}

	app.addHook("onRequest", async (request, reply) => {
		if (isPublicPath(request.url)) return;
		if (disableAuth) return;

		// Rome bridge 앱 전용 가드: AGENTMESH_BRIDGE_TOKEN Bearer 토큰
		if (bridgeToken && isBridgeAuth(request, bridgeToken)) return;

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

	await app.register(a2uiRoutes);
	await app.register(ghostRoutes);
	await app.register(ghostDispatchRoutes);
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
	await app.register(pythiaRoutes);
	await app.register(cosmosRoutes);
	await app.register(creditsRoutes);
	await app.register(factoryRoutes);
	await app.register(elizaosRpcRoutes);
	await app.register(securityRoutes);
	await app.register(shoppingRoutes);
	await app.register(feedRoutes);
	await app.register(authRoutes);
	await app.register(pulseRoutes);
	await app.register(quorumRoutes);
	await app.register(omniRouteRoutes);
	await app.register(openaiCompatRoutes);
	await app.register(worldRoutes);
	await app.register(visitorRoutes);
	await app.register(vietnamRoutes);
	await app.register(listRoutes);
	await app.register(paymentRoutes);
	await app.register(routerRoutes);
	await app.register(mcpRoutes);
	await app.register(opsmaxxMcpRoutes, {
		opsmaxxBridge: options.opsmaxxBridge,
	});
	await app.register(catalogRoutes);
	await app.register(collaborationRoutes);
	await app.register(resonanceRoutes);
	await app.register(a2aRoutes);

	// Liveness probes. Both are public + rate-limit exempt (see above) so
	// orchestrators and the Rome agentmesh-bridge `status` action
	// (GET /health via gatewayHealth()) can poll without credentials.
	app.get("/health", async () => ({
		ok: true,
		service: "agentmesh-api",
		uptimeSeconds: Math.floor(process.uptime()),
		timestamp: new Date().toISOString(),
	}));
	app.get("/api/health", async () => ({
		ok: true,
		service: "agentmesh-api",
		uptimeSeconds: Math.floor(process.uptime()),
		timestamp: new Date().toISOString(),
	}));

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

	// Simple agent registry for A2A discovery
	const agentRegistry = {
		getAgentCard() {
			return {
				name: "MuhanAI Agent",
				description:
					"MuhanAI mesh agent with P2P inference, MCP tools, and knowledge graph capabilities",
				url: process.env.AGENT_CARD_URL ?? "https://api.muhanai.com",
				version: "1.0.0",
				capabilities: {
					streaming: true,
					pushNotifications: true,
					stateTransitionHistory: false,
				},
				authentication: {
					schemes: ["bearer"],
				},
				skills: [
					{
						id: "p2p-inference",
						name: "P2P Distributed Inference",
						description:
							"Run LLM inference across decentralized peer network (XLang, OpenHydra, Ollama, libp2p)",
						tags: ["llm", "inference", "p2p", "distributed"],
						inputModes: ["text"],
						outputModes: ["text"],
					},
					{
						id: "mcp-tools",
						name: "MCP Tool Execution",
						description: "Execute Model Context Protocol tools registered in the mesh",
						tags: ["mcp", "tools", "execution"],
						inputModes: ["text", "data"],
						outputModes: ["text", "data"],
					},
					{
						id: "knowledge-graph",
						name: "Knowledge Graph Query",
						description: "Query the distributed knowledge graph (Noema + vector + graph)",
						tags: ["knowledge", "graph", "query", "rag"],
						inputModes: ["text"],
						outputModes: ["text", "data"],
					},
					{
						id: "agent-cast",
						name: "Agent Cast Consensus",
						description: "Multi-agent consensus via recursive CAST protocol",
						tags: ["consensus", "multi-agent", "cast"],
						inputModes: ["text"],
						outputModes: ["text", "data"],
					},
				],
				defaultInputModes: ["text"],
				defaultOutputModes: ["text"],
			};
		},
	};

	setAgentRegistry(agentRegistry);

	return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
	const app = await buildApp();
	// The port/host are configurable so a second deployment (e.g. the ShadowBroker
	// world API alongside the existing agentmesh instance) can run without
	// colliding with the default 3001 listener or the public bind.
	const port = Number(process.env.PORT ?? 3001);
	const host = process.env.HOST ?? "0.0.0.0";
	try {
		await app.listen({ port, host });
		app.log.info(`API server listening on http://${host}:${port}`);
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
}
