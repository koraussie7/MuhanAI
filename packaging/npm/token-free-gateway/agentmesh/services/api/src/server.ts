import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { getLogger } from "@agentmesh/shared";
import { noemaRoutes } from "./noema-routes.js";
import { semanticRoutes } from "./semantic-routes.js";
import { hivebearRoutes } from "./hivebear-routes.js";
import { knowledgeRoutes } from "./knowledge-routes.js";
import { networkRoutes } from "./network-routes.js";
import { agentsRoutes } from "./agents-routes.js";
import { computeRoutes } from "./compute-routes.js";
import { creditsRoutes } from "./credits-routes.js";
import { feedRoutes } from "./feed-routes.js";
import { authRoutes } from "./auth-routes.js";

const PUBLIC_PATH_PREFIXES = ["/api/pulse", "/api/network", "/api/agents", "/api/auth"];
const PUBLIC_PATH_EXACT = new Set(["/health"]);

function isPublicPath(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  const path = rawUrl.split("?")[0];
  if (!path) return false;
  if (PUBLIC_PATH_EXACT.has(path)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function buildApp(options: { logger?: ReturnType<typeof getLogger> } = {}) {
  const isProduction = process.env.NODE_ENV === "production";
  const logger = options.logger ?? getLogger({ service: "api" });

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

  // Security headers (helmet). CSP off — when a real policy is wired it should
  // be passed explicitly so it can be reviewed in one place.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // CORS: restrict to known origins in production, allow localhost in development
  const allowedOrigins = isProduction
    ? (process.env.ALLOWED_ORIGINS?.split(",") ?? ["https://muhanai.com", "https://www.muhanai.com"])
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
    logger.warn("API_KEY env var is unset in production — every protected request will be rejected with 401. Set API_KEY before serving traffic.");
  }

  app.addHook("onRequest", async (request, reply) => {
    if (isPublicPath(request.url)) return;
    if (!isProduction && process.env.DISABLE_AUTH === "true") return;

    const validApiKey = process.env.API_KEY;
    const apiKey = request.headers["x-api-key"];

    if (!validApiKey || apiKey !== validApiKey) {
      reply.code(401).send({ error: "Unauthorized: invalid or missing API key" });
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
  await app.register(creditsRoutes);
  await app.register(feedRoutes);
  await app.register(authRoutes);

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
